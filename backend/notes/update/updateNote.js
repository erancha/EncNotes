const { DynamoDBClient } = require('@aws-sdk/client-dynamodb');
const { DynamoDBDocumentClient, UpdateCommand } = require('@aws-sdk/lib-dynamodb');
const { prepareCorsHeaders } = require('/opt/corsHeaders');
const { getUserDataKey, encrypt } = require('/opt/encryption');
const Redis = require('ioredis');
const { SQSClient, SendMessageCommand } = require('@aws-sdk/client-sqs');

const client = new DynamoDBClient({});
const docClient = DynamoDBDocumentClient.from(client);

exports.handler = async (event) => {
  const origin = event.headers.Origin || event.headers.origin; // Get the origin from request headers
  const headers = prepareCorsHeaders(origin, 'OPTIONS,PUT');

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
    const requestBody = JSON.parse(event.body);
    const { title, content, archived } = requestBody;

    let updateCommand;
    if (title) {
      // update a note:
      const userDataKey = await getUserDataKey(event.requestContext.authorizer.claims.sub);
      updateCommand = new UpdateCommand({
        TableName: process.env.NOTES_TABLE_NAME,
        Key: { id: noteId },
        UpdateExpression: 'SET title = :title, content = :content, updatedAt = :updatedAt',
        ExpressionAttributeValues: {
          ':title': title,
          ':content': await encrypt(userDataKey, content),
          ':updatedAt': new Date().toISOString(),
        },
        ReturnValues: 'ALL_NEW',
      });
    } else {
      // restore a note:
      updateCommand = new UpdateCommand({
        TableName: process.env.NOTES_TABLE_NAME,
        Key: { id: noteId },
        UpdateExpression: 'SET archived = :archived, updatedAt = :updatedAt',
        ExpressionAttributeValues: {
          ':archived': archived,
          ':updatedAt': new Date().toISOString(),
        },
        ReturnValues: 'ALL_NEW',
      });
    }
    const result = await docClient.send(updateCommand);

    // handle connected devices of the current user:
    const currentUserId = event.requestContext.authorizer.claims.sub;
    const redisClient = new Redis(process.env.ELASTICACHE_REDIS_ADDRESS);
    const connectionIds = await redisClient.smembers(`connections:${currentUserId}`);

    const sqsClient = new SQSClient({ region: process.env.APP_AWS_REGION });
    const sqsParams = {
      QueueUrl: process.env.QUEUE_URL,
      MessageGroupId: 'Default', // Required for FIFO queues
    };

    for (const connectionId of connectionIds) {
      try {
        sqsParams.MessageBody = JSON.stringify({
          connectionId,
          command: { refresh: true },
          message: title ? `A note was updated : ${title}.` : `A note was restored : ${noteId}.`,
        });
        await sqsClient.send(new SendMessageCommand(sqsParams));
      } catch (error) {
        console.error(error);
      }
    }

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({ message: 'Note updated successfully', note: result.Attributes }),
    };
  } catch (error) {
    console.error('Error updating note:', error);
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ message: 'Error updating note' }),
    };
  }
};
