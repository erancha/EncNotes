const crypto = require('crypto');

// Encrypt plaintext (string) into binaryCipherContent (binary)
async function encrypt(userDataKey, plaintext) {
  try {
    // Generate a random IV (Initialization Vector)
    const iv = crypto.randomBytes(12);

    // Create cipher using AES-256-GCM
    const cipher = crypto.createCipheriv('aes-256-gcm', userDataKey, iv);

    // Encrypt the plaintext
    let encryptedData = cipher.update(plaintext, 'utf8');
    encryptedData = Buffer.concat([encryptedData, cipher.final()]);

    // Get the authentication tag
    const authTag = cipher.getAuthTag();

    // Combine IV, encrypted data, and auth tag
    const binaryCipherContent = Buffer.concat([iv, encryptedData, authTag]);

    return binaryCipherContent;
  } catch (error) {
    console.error({ error });
  }
}

// Decrypt binaryCipherContent (binary) into plaintext (string)
async function decrypt(userDataKey, binaryCipherContent) {
  try {
    // Extract IV, encrypted data, and auth tag from binaryCipherContent
    const iv = binaryCipherContent.slice(0, 12);
    const encryptedData = binaryCipherContent.slice(12, -16);
    const authTag = binaryCipherContent.slice(-16);

    // Create decipher using AES-256-GCM
    const decipher = crypto.createDecipheriv('aes-256-gcm', userDataKey, iv);
    decipher.setAuthTag(authTag);

    // Decrypt the data
    let decrypted = decipher.update(encryptedData);
    decrypted = Buffer.concat([decrypted, decipher.final()]);

    // Convert decrypted buffer to string
    const plaintext = decrypted.toString('utf8');

    return plaintext;
  } catch (error) {
    console.error({ error });
  }
}

// The function getUserDataKey generates a new user data key (AKA DEK) per user, or use a cached one (either first from elasticache if caching was enabled, otherwise only from a dynamodb table).
//
// Target use case:
//    A data table, with records belonging to different users.
//    Records of each user should be encrypted and decrypted using a data key specific to this user.
//    In theory, there could be thousands of users.
//
// Recommended Key Management Approach
// 1. Use one Customer Master Key (CMK):
//    Create a single Customer Master Key (CMKs) in AWS Key Management Service (KMS) that will be used to generate data keys for user-specific encryption.
// 2. Generate User-Specific Data Keys:
//    For each user, generate a unique data key (DEK) using the CMK. This can be done when a user is created or when their first record is encrypted.
//    Store the user-specific plaintext DEK temporarily in memory for encryption purposes while performing the operation.
// 3. Encrypt User Data:
//    Encrypt user records using the plaintext DEK generated for that specific user.
// 4. Store the Encrypted Data Key:
//    Store the encrypted DEK in a dedicated DynamoDB table. This way, you can retrieve the encrypted DEK when you need to decrypt the user's data later.
// 5. Decryption Process:
//    When you need to decrypt a user's data, retrieve the encrypted DEK from the database.
//    Use the CMK to decrypt it and obtain the plaintext DEK.
//    Use the plaintext DEK to decrypt the user’s records.
//
// Benefits of This Approach
//    Scalability: Avoids the overhead of managing thousands of CMKs. Instead, manage one CMK while still providing individual data key for each user.
//    Security: By using user-specific DEKs for encryption, ensures that even if one user’s DEK is compromised, it does not affect other users' data.
//    Performance: Minimizes the number of calls to KMS by generating DEKs only when needed, leading to better performance during encryption and decryption operations.
//    Simplicity in Key Management: Managing a few CMKs while leveraging them to generate multiple DEKs simplifies the process of key management.
//    Cost: Managing thousands of CMKs could be costly.

const { KMSClient, GenerateDataKeyCommand, DecryptCommand } = require('@aws-sdk/client-kms');
const { DynamoDBClient, GetItemCommand, PutItemCommand } = require('@aws-sdk/client-dynamodb');
const Redis = require('ioredis');

const kmsClient = new KMSClient({ region: process.env.APP_AWS_REGION });
const dynamoDBClient = new DynamoDBClient({ region: process.env.APP_AWS_REGION });
const USERS_TABLE_NAME = process.env.USERS_TABLE_NAME;

async function getUserDataKey(userId) {
  let userDataKey = null; // plaintext DEK

  try {
    // if a Write-Through Cache for user data keys (DEKs) was enabled.
    // Write-Through Cache is a caching strategy where any updates to the cached data also result in an immediate update to the underlying data store (like a database).
    //----------------------------------------------------------------------------------
    if (process.env.ELASTICACHE_REDIS_ADDRESS !== '') {
      const redisClient = new Redis(process.env.ELASTICACHE_REDIS_ADDRESS);

      // Get the plaintext DEK from Redis with key === userId
      const REDIS_KEY_DEK_OF_USER = `keys:${userId}`;
      userDataKey = await redisClient.getBuffer(REDIS_KEY_DEK_OF_USER);
      if (!userDataKey) {
        // Get the encrypted DEK from DynamoDB users table, by userId
        const params = {
          TableName: USERS_TABLE_NAME,
          Key: {
            userId: { S: userId },
          },
        };
        const command = new GetItemCommand(params);
        const result = await dynamoDBClient.send(command);
        const foundInDB = result.Item;
        if (foundInDB) {
          // decrypt the encrypted DEK using the CMK (the KMS uses the CMK that was used to encrypt the data automatically)
          const encryptedDEK = foundInDB.encryptedDEK.B;
          const decryptParams = {
            CiphertextBlob: encryptedDEK,
          };
          const decryptCommand = new DecryptCommand(decryptParams);
          const decryptResponse = await kmsClient.send(decryptCommand);
          userDataKey = decryptResponse.Plaintext;

          // Write the plaintext DEK to Redis (with the userId)
          await redisClient.set(REDIS_KEY_DEK_OF_USER, Buffer.from(userDataKey));
        } else {
          // Generate a new DEK (encrypted DEK + plaintext DEK) using KMS' GenerateDataKey API
          const generateDataKeyCommand = new GenerateDataKeyCommand({
            KeyId: process.env.KMS_KEY_ALIAS,
            KeySpec: 'AES_256',
          });

          const dataKeyResponse = await kmsClient.send(generateDataKeyCommand);
          const { Plaintext, CiphertextBlob } = dataKeyResponse;

          userDataKey = Plaintext;

          // Write the plaintext DEK into Redis (with the userId)
          await redisClient.set(REDIS_KEY_DEK_OF_USER, Buffer.from(userDataKey));

          // Write the encrypted DEK into the DynamoDB users table (with the userId)
          const putParams = {
            TableName: USERS_TABLE_NAME,
            Item: {
              userId: { S: userId },
              encryptedDEK: { B: CiphertextBlob },
            },
          };
          await dynamoDBClient.send(new PutItemCommand(putParams));
        }
      } else {
        // console.info(`Cache hit - plaintext DEK for '${REDIS_KEY_DEK_OF_USER}' successfully retrieved from Elasticache redis.`);
      }
    } else {
      // a distributed cache (elasticache) for user data keys (DEKs) was NOT enabled.
      //-----------------------------------------------------------------------------

      // Try to get the encrypted DEK of userId from DynamoDB
      const command = new GetItemCommand({
        TableName: USERS_TABLE_NAME,
        Key: {
          userId: { S: userId },
        },
      });
      const result = await dynamoDBClient.send(command);
      const foundInDB = result.Item;
      if (!foundInDB) {
        // Generate a new DEK using KMS
        const generateDataKeyCommand = new GenerateDataKeyCommand({
          KeyId: process.env.KMS_KEY_ALIAS,
          KeySpec: 'AES_256',
        });
        const dataKeyResponse = await kmsClient.send(generateDataKeyCommand);
        const { Plaintext, CiphertextBlob } = dataKeyResponse;

        // Write the encrypted DEK (CiphertextBlob) into the DynamoDB table
        const putParams = {
          TableName: USERS_TABLE_NAME,
          Item: {
            userId: { S: userId },
            encryptedDEK: { B: CiphertextBlob }, // Store the encrypted DEK as binary
          },
        };

        await dynamoDBClient.send(new PutItemCommand(putParams));

        userDataKey = Plaintext;
      } else {
        // If found in DB, decrypt the encrypted DEK using the CMK (the KMS uses the CMK that was used to encrypt the data automatically)
        const decryptCommand = new DecryptCommand(
          (decryptParams = {
            CiphertextBlob: foundInDB.encryptedDEK.B, // Retrieve the binary encrypted DEK
          })
        );
        const decryptResponse = await kmsClient.send(decryptCommand);
        userDataKey = decryptResponse.Plaintext;
      }
    }
  } catch (error) {
    console.error({ error });
  }

  // console.log({ userId, userDataKey });
  return userDataKey;
}

module.exports = { getUserDataKey, encrypt, decrypt };
