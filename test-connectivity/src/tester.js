const { DynamoDBClient } = require('@aws-sdk/client-dynamodb');
const { DynamoDBDocumentClient, QueryCommand, UpdateCommand } = require('@aws-sdk/lib-dynamodb');
const { KMSClient, GenerateDataKeyCommand } = require('@aws-sdk/client-kms');
const Redis = require('ioredis');
const { ApiGatewayManagementApiClient, PostToConnectionCommand } = require('@aws-sdk/client-apigatewaymanagementapi');
const { SQSClient, SendMessageCommand } = require('@aws-sdk/client-sqs');
const { getUserDataKey, decrypt, encrypt } = require('/opt/encryption');

const formatNumber = (number) => {
  return new Intl.NumberFormat('en-US').format(number); // 'en-US' can be changed to any locale you prefer
};

// {
//   "dynamodb": "",
//   "kms": false,
//   "redisParams": {
//     "test": true,
//     "insertDurationSeconds": 0,
//     "writersCount" : 5,
//     "readersCount": 20,
//     "deleteUnnamed": true,
//     "deleteKeys": ["^cht.*:messages\\(global\\)$", "^cht-f1.*"],
//     "flushall": false
//   },
////   "websocketParams": {
////     "test": false,
////     "websocketUrl": "wss://2tjkvv6211.execute-api.eu-central-1.amazonaws.com/dev",
////     "connectionIds": ["AUVnKcFPliACHaQ=", "AUVnHfvgliACFmA="]
////   },
//   "sqsParams": {
//     "test": false,
//     "connectionIds": ["AUVnKcFPliACHaQ="],
//     "repeat": 2
//   },
//   "encryptionLayer": false
// }
exports.handler = async (event) => {
  try {
    if (process.env.APP_AWS_REGION === '') {
      console.error('Connectivity Test: Skipped (No APP_AWS_REGION defined)');
      return false;
    }

    let connectivityTested = true;
    if (event.dynamodb)
      connectivityTested &= event.dynamodb === 'notes' ? await testDynamoDBConnectivityNotesTable() : await testDynamoDBConnectivityMessagesTable();
    if (event.kms) connectivityTested &= await testKMSConnectivity();
    if (event.redisParams?.test) connectivityTested &= await testRedisConnectivity(event.redisParams);
    if (event.websocketParams?.test) connectivityTested &= await testWebSocketConnectivity(event.websocketParams);
    if (event.sqsParams?.test) connectivityTested &= await testSQSConnectivity(event.sqsParams);
    if (event.encryptionLayer) connectivityTested &= await testEncryptionLayer();

    console.log({ connectivityTested });
  } catch (error) {
    console.error(error);
  }
};

//=============================================================================================================
async function testDynamoDBConnectivityNotesTable() {
  try {
    if (!process.env.APP_AWS_REGION) {
      console.log('testDynamoDBConnectivityNotesTable: Skipped (No process.env.APP_AWS_REGION)');
      return false;
    }
    console.log('testDynamoDBConnectivityNotesTable');
    const dynamoDBDocumentClient = DynamoDBDocumentClient.from(new DynamoDBClient({ region: process.env.APP_AWS_REGION }));
    const userId = process.env.USER_ID;
    const result = await dynamoDBDocumentClient.send(
      new QueryCommand({
        TableName: process.env.NOTES_TABLE_NAME,
        IndexName: 'UserIdUpdatedIndex',
        KeyConditionExpression: 'userId = :userId',
        ExpressionAttributeValues: {
          ':userId': userId,
        },
        Select: 'COUNT',
        ScanIndexForward: false,
      })
    );
    console.log(`DynamoDB Connectivity Test - Number of items found for user ${userId}: ${result.Count}`);
    return true;
  } catch (error) {
    console.error('DynamoDB Connectivity Test Failed:', error);
    return false;
  }
}
//=============================================================================================================
async function testDynamoDBConnectivityMessagesTable() {
  try {
    if (!process.env.APP_AWS_REGION) {
      console.log('testDynamoDBConnectivityMessagesTable: Skipped (No process.env.APP_AWS_REGION)');
      return false;
    }
    console.log('testDynamoDBConnectivityMessagesTable');
    const dynamoDBDocumentClient = DynamoDBDocumentClient.from(new DynamoDBClient({ region: process.env.APP_AWS_REGION }));

    const chatId = 'global';

    // Step 1: Query messages for the given chatId
    const result = await dynamoDBDocumentClient.send(
      new QueryCommand({
        TableName: process.env.MESSAGES_TABLE_NAME,
        IndexName: 'ChatIdUpdatedIndex',
        KeyConditionExpression: 'chatId = :chatId',
        ExpressionAttributeValues: {
          ':chatId': chatId,
        },
      })
    );

    console.log(`DynamoDB Connectivity Test - Number of items found for chatId ${chatId}: ${result.Count}`);

    // Step 2: Process each record
    for (const item of result.Items) {
      if (item.content && item.content.startsWith(' : ')) {
        const newContent = item.content.replace(' : ', '');
        console.log({ newContent });

        // Step 3: Update the record with the new content
        await dynamoDBDocumentClient.send(
          new UpdateCommand({
            TableName: process.env.MESSAGES_TABLE_NAME,
            Key: { id: item.id },
            UpdateExpression: 'set #content = :newContent',
            ExpressionAttributeNames: {
              '#content': 'content',
            },
            ExpressionAttributeValues: {
              ':newContent': newContent,
            },
          })
        );
        console.log(`Updated content for item with id ${item.id}`);
      }
    }

    return true;
  } catch (error) {
    console.error('DynamoDB Connectivity Test Failed:', error);
    return false;
  }
}

//=============================================================================================================
async function testKMSConnectivity() {
  try {
    console.log('testKMSConnectivity');
    const kmsClient = new KMSClient({ region: process.env.APP_AWS_REGION });
    const { Plaintext, CiphertextBlob } = await kmsClient.send(
      new GenerateDataKeyCommand({
        KeyId: process.env.KMS_KEY_ALIAS,
        KeySpec: 'AES_256',
      })
    );
    console.log('KMS Connectivity Test - Size of CiphertextBlob:', CiphertextBlob.length);
    return true;
  } catch (error) {
    console.error('KMS Connectivity Test Failed:', error);
    return false;
  }
}

//=============================================================================================================
async function testRedisConnectivity(redisParams) {
  const redisAddress = process.env.ELASTICACHE_REDIS_ADDRESS;
  if (!redisAddress) {
    console.log('Redis Connectivity Test: Skipped (No Redis address provided)');
    return false;
  }

  try {
    console.log(`testRedisConnectivity: ${redisAddress}`);
    const redisClient = new Redis(redisAddress);

    if (redisParams.insertDurationSeconds > 0) {
      await simulateRedisLoad(redisClient, redisParams.insertDurationSeconds * 1000, redisParams.writersCount, redisParams.readersCount);
    }

    const keys = await redisClient.keys('*');
    const dbsize = await redisClient.dbsize();
    console.log(`Retrieved ${formatNumber(keys.length)} keys${dbsize !== keys.length ? ` (!== dbsize${dbsize})` : ''}.`);

    if (keys.length > 0) {
      keys.sort();
      let deletedKeysCount = 0;
      const deletePatterns = redisParams.deleteKeys?.map((pattern) => new RegExp(pattern)) || [];

      for (const key of keys) {
        if (
          key.includes('test:') ||
          (redisParams.deleteUnnamed && !key.includes(':') && !key.includes('(')) ||
          redisParams.deleteKeys?.some((pattern) => pattern === key) || // Check for exact matches
          deletePatterns.some((pattern) => pattern.test(key)) // Check for regex matches
        ) {
          console.log(`Deleting key: ${key}`);
          deletedKeysCount++;
          await redisClient.del(key);
        } else {
          const type = await redisClient.type(key);
          if (type === 'string') {
            const value = await redisClient.get(key);
            console.log(`${key}  ==>  ${value}`);
          } else if (type === 'set') {
            const members = await redisClient.smembers(key);
            console.log(`${key}  ==>  ${JSON.stringify(members)}`);
          } else if (type === 'list') {
            const length = await redisClient.llen(key);
            const firstItem = await redisClient.lindex(key, 0);
            const lastItem = await redisClient.lindex(key, length - 1);
            console.log(`${key}  ==>  ${length} items, first .. last items: ${firstItem} .. ${lastItem}`);
            // if (key.startsWith('cht-f2:')) {
            //   await updateCache('cht-f2', redisClient);
            //   const length = await redisClient.llen(key);
            //   const firstItem = await redisClient.lindex(key, 0);
            //   const lastItem = await redisClient.lindex(key, length - 1);
            //   console.log(`${key}  ==>  ${length} items, first .. last items: ${firstItem} .. ${lastItem}`);
            // }
          } else {
            console.log(`The value of '${key}' is '${type}' ! (not a string, set, or list)`);
          }
        }
      }
      console.log(`Deleted ${formatNumber(deletedKeysCount)} keys.`);
    }

    if (redisParams.flushall) await redisClient.flushall();

    await redisClient.quit();
    return true;
  } catch (error) {
    console.error('Redis Connectivity Test Failed:', error);
    return false;
  }
}

async function updateCache(STACK_NAME, redisClient) {
  const luaScript = `
  local STACK_NAME = ARGV[1]
  local chatId = ARGV[2]
  local newItem = ARGV[3]
  local maxItems = tonumber(ARGV[4])
  
  local chatMessagesKey = STACK_NAME .. ":messages(" .. chatId .. ")"
  
  -- Check if the cache exists (otherwise the new item will not be inserted, and previous messages will be loaded when the first subsequent client will authenticate).
  if redis.call('EXISTS', chatMessagesKey) > 0 then
    -- Insert the new item at the beginning of the list
    redis.call('LPUSH', chatMessagesKey, newItem)
  
    -- Remove the last item if the current length (including the new item) exceeds the maxItems limit
    local length = redis.call('LLEN', chatMessagesKey)
    if length > maxItems then
        redis.call('RPOP', chatMessagesKey)
    end
  end
  `;

  await redisClient.eval(
    luaScript,
    0,
    STACK_NAME,
    'global',
    JSON.stringify({
      id: 'newItem.id',
      timestamp: new Date('2024-12-10T16:00:44.194Z').getTime(),
      content: 'newItem.content',
      sender: 'newItem.sender',
      viewed: true,
    }),
    100 // max items
  );
}

async function simulateRedisLoad(redisClient, insertDurationMS, writersCount, readersCount) {
  console.log(`simulateRedisLoad: Insert for ${formatNumber(insertDurationMS)} ms, ${writersCount} writers, ${readersCount} readers.`);

  const keysToInsert = new Set();
  let isInserting = true;

  // Track metrics
  const metrics = {
    insertedKeys: 0,
    readOperations: 0,
    errors: 0,
    startTime: Date.now(),
  };

  // Insert keys for the specified duration
  const insertKeys = async () => {
    try {
      while (isInserting) {
        const key = `test-${crypto.randomUUID()}`;
        keysToInsert.add(key);
        await redisClient.set(key, `value of ${key}`);
        metrics.insertedKeys++;
      }
    } catch (error) {
      metrics.errors++;
      console.error('Error inserting keys :', error);
    }
  };

  // Start multiple insert operations
  const writers = Array.from({ length: writersCount }, () => insertKeys());

  // Stop inserting after the specified duration
  await new Promise((resolve) =>
    setTimeout(() => {
      isInserting = false;
      resolve();
    }, insertDurationMS)
  );

  // Wait for all insertions to complete
  await Promise.all(writers);

  console.log(`Inserted ${formatNumber(metrics.insertedKeys)} keys.`);

  // Create reader threads
  const readers = Array.from({ length: readersCount }, async (_, readerId) => {
    const threadMetrics = {
      startTime: Date.now(),
      keysRead: 0,
      errors: 0,
    };

    try {
      // Convert Set to Array for iteration
      const keys = Array.from(keysToInsert);

      // Each reader reads all keys
      for (const key of keys) {
        await redisClient.get(key);
        threadMetrics.keysRead++;
        metrics.readOperations++;
      }
    } catch (error) {
      threadMetrics.errors++;
      metrics.errors++;
      console.error(`Thread ${readerId} error:`, error);
    }

    const elapsedTime = Date.now() - threadMetrics.startTime;
    console.log(`Reader ${readerId} completed in ${formatNumber(elapsedTime)}ms (read ${formatNumber(threadMetrics.keysRead)} keys).`);

    return threadMetrics;
  });

  // Wait for all readers to complete
  const readerResults = await Promise.all(readers);

  // Calculate final metrics
  const totalDuration = Date.now() - metrics.startTime;
  const totalReads = readerResults.reduce((sum, t) => sum + t.keysRead, 0);

  return {
    duration: totalDuration,
    insertedKeys: metrics.insertedKeys,
    totalReads,
    readsPerSecond: (totalReads / totalDuration) * 1000,
    errors: metrics.errors,
  };
}
// Live Tail > Add filter patterns: ?"keys." ?"keys)" ?" keys " ?testRedisConnectivity ?simulateRedisLoad

//=============================================================================================================
async function testWebSocketConnectivity(websocketParams) {
  if (!websocketParams.websocketUrl || !websocketParams.connectionIds) {
    console.log('WebSocket Connectivity Test: Skipped (No websocket endpoint and connection id provided)');
    return false;
  }
  console.log('testWebSocketConnectivity: ', { websocketParams });

  // Try both the VPC endpoint and direct URL formats
  const endpoints = [
    websocketParams.websocketUrl.replace(/^wss/, 'https'),
    'https://vpce-0b2d8420a58f432a7-sllqfo4l.execute-api.eu-central-1.vpce.amazonaws.com',
    'https://vpce-0b2d8420a58f432a7-sllqfo4l-eu-central-1a.execute-api.eu-central-1.vpce.amazonaws.com',
  ];

  for (const endpoint of endpoints) {
    console.log(`Trying endpoint: ${endpoint}`);

    const callbackAPI = new ApiGatewayManagementApiClient({
      apiVersion: '2018-11-29',
      endpoint,
    });

    try {
      for (const connectionId of websocketParams.connectionIds) {
        const message = new Date().toLocaleTimeString();
        await client.send(
          new PostToConnectionCommand({
            ConnectionId: connectionId,
            Data: Buffer.from(`{"message": "${message}"}`),
          })
        );
        console.log(`Message ${message} sent successfully on connection ${connectionId}.`);
      }
      return true;
    } catch (error) {
      // console.log('Detailed error information:');
      console.log('Error name:', error.name);
      console.log('Error message:', error.message);
      // console.log('HTTP status code:', error.$metadata?.httpStatusCode);
      // console.log('Request ID:', error.$metadata?.requestId);
      // console.log('Full error:', JSON.stringify(error, null, 2));
    }
  }

  return false;
}

//=============================================================================================================
async function testSQSConnectivity(sqsParams) {
  const queueUrl = process.env.SQS_QUEUE_URL;
  if (!queueUrl) {
    console.log('SQS Connectivity Test: Skipped (No process.env.SQS_QUEUE_URL provided)');
    return false;
  }
  console.log(`testSQSConnectivity: ${queueUrl}.`);
  const client = new SQSClient({ region: process.env.APP_AWS_REGION });

  try {
    const params = {
      QueueUrl: queueUrl,
      MessageGroupId: 'Default', // Required for FIFO queues
    };
    for (let i = 0; i < sqsParams.connectionIds.length; i++) {
      const connectionId = sqsParams.connectionIds[i];
      console.log({ connectionId });
      for (let j = 0; j < sqsParams.repeat; j++) {
        params.MessageBody = JSON.stringify({
          connectionId,
          command: { refresh: true },
          message: `index: ${(i + 1) * 100 + j + 1}, timestamp: ${new Date().toISOString()}`,
        });
        let response = await client.send(new SendMessageCommand(params));
        console.log(`Message sent: ${JSON.stringify(params.MessageBody)}`);
      }
    }
    return true;
  } catch (error) {
    console.error(`Error sending message: ${error}`);
  }

  return false;
}

//=============================================================================================================
async function testEncryptionLayer() {
  if (!process.env.APP_AWS_REGION || !process.env.USER_ID) {
    console.log('testEncryptionLayer: Skipped (No process.env.APP_AWS_REGION or no process.env.USER_ID provided)');
    return false;
  }

  const userId = process.env.USER_ID;
  console.log(`testEncryptionLayer: ${userId}.`);

  const dynamoDBDocumentClient = DynamoDBDocumentClient.from(new DynamoDBClient({ region: process.env.APP_AWS_REGION }));

  try {
    const userDataKey = await getUserDataKey(userId);

    const result = await dynamoDBDocumentClient.send(
      new QueryCommand({
        TableName: process.env.NOTES_TABLE_NAME,
        IndexName: 'UserIdUpdatedIndex',
        KeyConditionExpression: 'userId = :userId',
        ExpressionAttributeValues: { ':userId': userId },
        Select: 'ALL_ATTRIBUTES',
        ScanIndexForward: false,
      })
    );
    let notes = await Promise.all(
      result.Items.map(async (item) => ({
        title: item.title,
        content: await decrypt(userDataKey, item.content),
      }))
    );
    console.log({ notes });

    return true;
  } catch (error) {
    console.error(`Error executing DynamoDB command: ${error}`);
  }

  return false;
}
