const { DynamoDBClient } = require('@aws-sdk/client-dynamodb');
const { DeleteCommand, DynamoDBDocumentClient } = require('@aws-sdk/lib-dynamodb');
const { prepareCorsHeaders } = require('/opt/corsHeaders');
const Redis = require('ioredis');
const { SQSClient, SendMessageCommand } = require('@aws-sdk/client-sqs');

const client = new DynamoDBClient({});
const docClient = DynamoDBDocumentClient.from(client);

exports.handler = async (event) => {
  const origin = event.headers.Origin || event.headers.origin; // Get the origin from request headers
  const headers = prepareCorsHeaders(origin, 'OPTIONS,DELETE');

  // Handle preflight request
  if (event.requestContext?.http?.method === 'OPTIONS') {
    return {
      statusCode: 200,
      headers,
      body: '',
    };
  }

  try {
    const noteId = event.pathParameters.id;
    await docClient.send(
      new DeleteCommand({
        TableName: process.env.NOTES_TABLE_NAME,
        Key: { id: noteId },
      })
    );

    // handle connected devices of the current user:
    const currentUserId = event.requestContext.authorizer.claims.sub;
    const redisClient = new Redis(process.env.ELASTICACHE_REDIS_ADDRESS);
    const connectionIds = await redisClient.smembers(`connections(${currentUserId})`);

    const sqsClient = new SQSClient({ region: process.env.APP_AWS_REGION });
    const sqsParams = {
      QueueUrl: process.env.SQS_QUEUE_URL,
      MessageGroupId: 'Default', // Required for FIFO queues
    };

    for (const connectionId of connectionIds) {
      try {
        sqsParams.MessageBody = JSON.stringify({ connectionId, command: { refresh: true }, message: `A note was deleted : ${noteId}.` });
        await sqsClient.send(new SendMessageCommand(sqsParams));
      } catch (error) {
        console.error(error);
      }
    }

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({ message: 'Note deleted successfully' }),
    };
  } catch (error) {
    console.error('Error deleting note:', error);
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ message: 'Could not delete note' }),
    };
  }
};
