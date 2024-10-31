const { DynamoDBClient } = require('@aws-sdk/client-dynamodb');
const { DynamoDBDocumentClient, QueryCommand } = require('@aws-sdk/lib-dynamodb');
const { prepareCorsHeaders } = require('/opt/corsHeaders');
const { getUserDataKey, decrypt } = require('/opt/encryption');

const dynamodbClient = new DynamoDBClient();
const dynamodb = DynamoDBDocumentClient.from(dynamodbClient);

// Lambda function handler
exports.handler = async (event) => {
  const origin = event.headers.Origin || event.headers.origin; // Get the origin from request headers
  const headers = prepareCorsHeaders(origin, 'OPTIONS,GET');

  // Handle preflight request
  if (event.requestContext?.http?.method === 'OPTIONS') {
    return {
      statusCode: 200,
      headers,
      body: '',
    };
  }

  const currentUserId = event.requestContext.authorizer.claims.sub;
  const { searchTerm, searchInTitle, searchInContent, caseSensitive } = event.queryStringParameters || {};

  const queryParams = {
    TableName: process.env.NOTES_TABLE_NAME,
    IndexName: 'UserIdUpdatedIndex',
    KeyConditionExpression: 'userId = :userId',
    ExpressionAttributeValues: { ':userId': currentUserId },
    Select: 'ALL_ATTRIBUTES',
    ScanIndexForward: false,
    // Limit: 50, //TODO: Handle pagination.
  };

  try {
    const userDataKey = await getUserDataKey(currentUserId);
    const result = await dynamodb.send(new QueryCommand(queryParams));
    let notes = await Promise.all(
      result.Items.map(async (item) => ({
        id: item.id,
        title: item.title,
        content: await decrypt(userDataKey, item.content),
        archived: item.archived,
        createdAt: item.createdAt,
        updatedAt: item.updatedAt,
      }))
    );

    // Apply search filtering if searchTerm is provided
    // TODO: FILTER IN DYNAMODB
    if (searchTerm) {
      notes = notes.filter((note) => {
        let titleMatch = false;
        let contentMatch = false;

        if (searchInTitle === 'true') {
          titleMatch = caseSensitive === 'true' ? note.title.includes(searchTerm) : note.title.toLowerCase().includes(searchTerm.toLowerCase());
        }
        if (searchInContent === 'true') {
          contentMatch = caseSensitive === 'true' ? note.content.includes(searchTerm) : note.content.toLowerCase().includes(searchTerm.toLowerCase());
        }

        return titleMatch || contentMatch;
      });
    }

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify(notes),
    };
  } catch (error) {
    console.error(JSON.stringify({ error }));
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ message: 'Failed to list notes' }),
    };
  }
};
