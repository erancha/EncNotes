const { DynamoDBClient } = require('@aws-sdk/client-dynamodb');
const { DynamoDBDocumentClient, PutCommand } = require('@aws-sdk/lib-dynamodb');
const crypto = require('crypto');
const { prepareCorsHeaders } = require('/opt/corsHeaders');
const { getUserDataKey, encrypt } = require('/opt/encryption');
const Redis = require('ioredis');
const { SQSClient, SendMessageCommand } = require('@aws-sdk/client-sqs');

const client = new DynamoDBClient({});
const docClient = DynamoDBDocumentClient.from(client);

// Lambda function handler
exports.handler = async (event) => {
  const origin = event.headers.Origin || event.headers.origin; // Get the origin from request headers
  const headers = prepareCorsHeaders(origin, 'OPTIONS,POST');

  // Handle preflight request
  if (event.requestContext?.http?.method === 'OPTIONS') {
    return {
      statusCode: 200,
      headers,
      body: '',
    };
  }

  try {
    const requestBody = JSON.parse(event.body);
    const { title, content } = requestBody;

    const noteId = crypto.randomUUID();
    const currentTimestamp = new Date().toISOString();

    const currentUserId = event.requestContext.authorizer.claims.sub;
    const userDataKey = await getUserDataKey(currentUserId);
    await docClient.send(
      new PutCommand({
        TableName: process.env.NOTES_TABLE_NAME,
        Item: {
          id: noteId,
          userId: currentUserId,
          title,
          content: await encrypt(userDataKey, content),
          createdAt: currentTimestamp,
          updatedAt: currentTimestamp,
        },
      })
    );

    // handle connected devices of the current user:
    const redisClient = new Redis(process.env.ELASTICACHE_REDIS_ADDRESS);
    const connectionIds = await redisClient.smembers(`connections:${currentUserId}`);

    const sqsClient = new SQSClient({ region: process.env.APP_AWS_REGION });
    const sqsParams = {
      QueueUrl: process.env.QUEUE_URL,
      MessageGroupId: 'Default', // Required for FIFO queues
    };

    for (const connectionId of connectionIds) {
      try {
        sqsParams.MessageBody = JSON.stringify({ connectionId, command: { refresh: true }, message: `A note was added : ${title}.` });
        await sqsClient.send(new SendMessageCommand(sqsParams));
      } catch (error) {
        console.error(error);
      }
    }

    return {
      statusCode: 201,
      headers,
      body: JSON.stringify({ message: 'Note added successfully', noteId }),
    };
  } catch (error) {
    console.error('Error adding note:', error);
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ message: 'Error adding note' }),
    };
  }
};
