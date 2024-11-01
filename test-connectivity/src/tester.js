const { KMSClient, GenerateDataKeyCommand } = require('@aws-sdk/client-kms');
const { DynamoDBClient, QueryCommand } = require('@aws-sdk/client-dynamodb');
const Redis = require('ioredis');
const { ApiGatewayManagementApiClient, PostToConnectionCommand } = require('@aws-sdk/client-apigatewaymanagementapi');
const { SQSClient, SendMessageCommand } = require('@aws-sdk/client-sqs');

// {
//   "dynamodb": true,
//   "kms": true,
//   "redisParams": {
//     "test": true,
//     "deleteUnnamed": true,
//     "deleteKeys": ["connections:23743842-4061-709b-44f8-4ef9a527509d"]
//   },
//   "websocketParams": {
//     "test": false,
//     "websocketUrl": "wss://2tjkvv6211.execute-api.eu-central-1.amazonaws.com/dev",
//     "connectionIds": ["AUVnKcFPliACHaQ=", "AUVnHfvgliACFmA="]
//   },
//   "sqsParams": {
//     "test": true,
//     "connectionIds": ["AUVnKcFPliACHaQ="],
//     "repeat": 2
//   }
// }
exports.handler = async (event) => {
  try {
    let connectivityTested = false;

    if (process.env.APP_AWS_REGION === '') {
      console.error('Connectivity Test: Skipped (No APP_AWS_REGION defined)');
      return false;
    }

    if (event.dynamodb) connectivityTested = await testDynamoDBConnectivity();
    if (event.kms) connectivityTested = await testKMSConnectivity();
    if (event.redisParams?.test) connectivityTested = await testRedisConnectivity(event.redisParams);
    if (event.websocketParams?.test) connectivityTested = await testWebSocketConnectivity(event.websocketParams);
    if (event.sqsParams?.test) connectivityTested = await testSQSConnectivity(event.sqsParams);

    console.log({ connectivityTested });
  } catch (error) {
    console.error(error);
  }
};

//=============================================================================================================
async function testDynamoDBConnectivity() {
  try {
    console.log('testDynamoDBConnectivity');
    const dynamoDBClient = new DynamoDBClient({ region: process.env.APP_AWS_REGION });
    const result = await dynamoDBClient.send(
      new QueryCommand({
        TableName: process.env.TABLE_NAME,
        IndexName: 'UserIdUpdatedIndex',
        KeyConditionExpression: 'userId = :userId',
        ExpressionAttributeValues: {
          ':userId': { S: '5314d812-40e1-706a-065b-780abe3331fa' },
        },
        Select: 'COUNT',
        ScanIndexForward: false,
        Limit: 50,
      })
    );
    console.log('DynamoDB Connectivity Test - Number of Items Found:', result.Count);
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

    const keys = await redisClient.keys('*'); // Get all keys from the Redis database
    if (keys.length === 0) {
      console.log('No keys found in Redis.');
    } else {
      keys.sort();
      for (const key of keys) {
        if ((!key.includes(':') && redisParams.deleteUnnamed) || redisParams.deleteKeys?.includes(key)) {
          console.log(`Deleting key: ${key}`);
          await redisClient.del(key);
        } else {
          const type = await redisClient.type(key); // Get the type of the key
          if (type === 'string') {
            const value = await redisClient.get(key); // Fetch the value for string keys
            console.log(`Key: ${key}, Value: ${value}`);
          } else if (type === 'set') {
            const members = await redisClient.smembers(key); // Get all members of the set
            console.log(`Key: ${key}, Members: ${JSON.stringify(members)}`);
          } else {
            console.log(`Key: ${key}, Type: ${type} (not a string or set)`);
          }
        }
      }
    }

    await redisClient.quit();
    return true;
  } catch (error) {
    console.error('Redis Connectivity Test Failed:', error);
    return false;
  }
}

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
  const queueUrl = process.env.QUEUE_URL;
  if (!queueUrl) {
    console.log('SQS Connectivity Test: Skipped (No process.env.QUEUE_URL provided)');
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
