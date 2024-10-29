const Redis = require('ioredis');

const redisClient = new Redis(process.env.ELASTICACHE_REDIS_ADDRESS);

exports.handler = async (event) => {
  const currentConnectionId = event.requestContext.connectionId;

  try {
    // Retrieve the currentUserId associated with currentConnectionId
    const currentUserId = await redisClient.get(`users:${currentConnectionId}`);
    if (currentUserId) {
      // -- Remove the connection ID from the user's connections set
      // -- Remove the mapping from currentConnectionId to userId
      // -- Return the updated set members
      const luaScript = `
        local currentUserId = KEYS[1]
        local currentConnectionId = KEYS[2]
        
        -- Remove the connection ID from the user's connections set
        redis.call('srem', 'connections:' .. currentUserId, currentConnectionId)
        
        -- Remove the mapping from currentConnectionId to userId
        redis.call('del', 'users:' .. currentConnectionId)
        
        -- Return the updated set members
        return redis.call('smembers', 'connections:' .. currentUserId)
        `;
      const updatedConnectionIds = await redisClient.eval(luaScript, 2, currentUserId, currentConnectionId);
    } else {
      console.warn(`No user found for connection ID ${currentConnectionId}`);
    }
  } catch (error) {
    console.error('Error executing Lua script in Redis:', error);
    return { statusCode: 500, body: JSON.stringify({ message: 'Internal Server Error' }) };
  }

  return { statusCode: 200 };
};
