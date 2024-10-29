const { ApiGatewayManagementApiClient, PostToConnectionCommand } = require('@aws-sdk/client-apigatewaymanagementapi');

exports.handler = async (event) => {
  try {
    const appGatewayClient = new ApiGatewayManagementApiClient({
      apiVersion: '2018-11-29',
      endpoint: process.env.WEBSOCKET_API_URL.replace(/^wss/, 'https'),
    });

    const records = event.Records;

    await Promise.all(
      records.map(async (record) => {
        const parsedRecord = JSON.parse(record.body);
        const connectionId = parsedRecord.connectionId;
        try {
          delete parsedRecord.connectionId;
          await appGatewayClient.send(
            new PostToConnectionCommand({
              ConnectionId: connectionId,
              Data: Buffer.from(JSON.stringify(parsedRecord)),
            })
          );
        } catch (error) {
          if (error.name === 'GoneException') {
            console.warn(error.name, `connectionId: ${connectionId}.`);

            // TODO: remove the connection from the user's connections (a little problematic since the current lambda is is in the default lambda space, unlike the others..)
          } else console.error(error, `connectionId: ${connectionId}.`);
        }
      })
    );
  } catch (error) {
    console.error(`Error receiving messages: ${error}`);
  }
};
