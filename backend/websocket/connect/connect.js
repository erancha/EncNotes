const { prepareCorsHeaders } = require('/opt/corsHeaders');
const jwt = require('jsonwebtoken');
const Redis = require('ioredis');

const redisClient = new Redis(process.env.ELASTICACHE_REDIS_ADDRESS);

exports.handler = async (event) => {
  //   console.log({ event });
  let token;

  // Try to extract the token from the Authorization header
  const authHeader = event.headers.Authorization || event.headers.authorization;
  if (authHeader) {
    // The token comes after 'Bearer ' in the Authorization header
    token = authHeader.split(' ')[1];
    if (!token) {
      throw new Error('Token is missing from Authorization header');
    }
  } else {
    // If no Authorization header, check for token in query string parameters
    if (event.queryStringParameters && event.queryStringParameters.token) {
      token = event.queryStringParameters.token;
    } else {
      throw new Error('Authorization header and query string token are missing');
    }
  }

  const decodedToken = jwt.decode(token);
  if (!decodedToken || !decodedToken.sub) {
    throw new Error('Invalid token: Missing user id (sub)');
  }

  const currentUserId = decodedToken.sub; // Extract user id (sub) from the token
  //   const origin = event.headers.Origin || event.headers.origin; // Get the origin from request headers
  //   const headers = prepareCorsHeaders(origin, 'OPTIONS,GET');

  //   // Handle preflight request
  //   if (event.requestContext?.http?.method === 'OPTIONS') {
  //     return {
  //       statusCode: 200,
  //       headers,
  //       body: '',
  //     };
  //   }

  const currentConnectionId = event.requestContext.connectionId;

  const luaScript = `
local currentUserId = KEYS[1]
local currentConnectionId = KEYS[2]

-- Store the user ID for the connection ID
redis.call('set', 'userId(' .. currentConnectionId .. ')', currentUserId)

-- Add the connection ID to the user's connections set
redis.call('sadd', 'connections(' .. currentUserId .. ')', currentConnectionId)

-- Retrieve and return all connection IDs for the user
return redis.call('smembers', 'connections(' .. currentUserId .. ')')
`;

  try {
    // -- Store the user ID for the connection ID
    // -- Add the connection ID to the user's connections set
    // -- Retrieve and return all connection IDs for the user
    const connectionIds = await redisClient.eval(luaScript, 2, currentUserId, currentConnectionId);
  } catch (error) {
    console.error('Error executing Lua script for $connect handler:', error);
  }

  return { statusCode: 200 };
};
