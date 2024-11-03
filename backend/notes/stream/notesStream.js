const { DynamoDBClient } = require('@aws-sdk/client-dynamodb');
const { DynamoDBDocumentClient, PutCommand } = require('@aws-sdk/lib-dynamodb');
const { unmarshall } = require('@aws-sdk/util-dynamodb');

// Create the DynamoDB client and document client
const ddbClient = new DynamoDBClient({});
const ddbDocClient = DynamoDBDocumentClient.from(ddbClient);

exports.handler = async (event) => {
  //   console.log('Processing DynamoDB Stream records');
  const currentTimestamp = new Date().toISOString();

  // Extract table name from the event records (assuming all records are from the same table)
  const tableName = event.Records[0].eventSourceARN.split(':')[5].split('/')[1];

  for (const record of event.Records) {
    //  console.log('Stream record:', JSON.stringify(record, null, 2));

    if (record.eventName === 'INSERT') {
      // console.log('New note created.');
    } else if (record.eventName === 'MODIFY') {
      // console.log('Note updated. Previous version:', record.dynamodb.OldImage);
      const oldItem = unmarshall(record.dynamodb.OldImage);
      if (!oldItem.archived) {
        const localeOldItemUpdatedAtDate = new Date(oldItem.updatedAt).toLocaleString('en-GB', {
          year: 'numeric',
          month: 'numeric',
          day: 'numeric',
        });
        try {
          // Archive the old image (previous state) of the modified record as a new record, and mark it as unrestorable (this is a copy only for future copy/paste, since the record still exists):
          const newItem = {
            ...oldItem,
            id: `${oldItem.id}-${oldItem.updatedAt}`,
            title: `${oldItem.title}  (${localeOldItemUpdatedAtDate})`,
            archived: true,
            unrestorable: true,
            createdAt: currentTimestamp,
            updatedAt: currentTimestamp,
          };
          if (oldItem.content) newItem.content = Buffer.from(oldItem.content, 'base64');

          await ddbDocClient.send(
            new PutCommand({
              TableName: tableName, // Use the extracted table name from the event
              Item: newItem,
            })
          );
          //  console.log('Inserted new record for modified item:', newItem);
        } catch (error) {
          console.error('Failed to insert new record:', error);
        }
      }
    } else if (record.eventName === 'REMOVE') {
      // console.log('Note deleted:', record.dynamodb.OldImage);
      const deletedItem = unmarshall(record.dynamodb.OldImage);
      if (!deletedItem.archived) {
        try {
          // Modify the deleted record to be archived and insert it back into the table:
          const newItem = {
            ...deletedItem,
            archived: true,
            updatedAt: currentTimestamp,
          };
          if (deletedItem.content) newItem.content = Buffer.from(deletedItem.content, 'base64');

          await ddbDocClient.send(
            new PutCommand({
              TableName: tableName, // Use the extracted table name from the event
              Item: newItem,
            })
          );
          //  console.log('Inserted new record for deleted item:', newItem);
        } catch (error) {
          console.error('Failed to insert new record:', error);
        }
      }
    }
  }

  return { statusCode: 200, body: 'Successfully processed DynamoDB Stream records' };
};
