const AWS = require('aws-sdk');

const dynamoDb = new AWS.DynamoDB.DocumentClient({
    endpoint: 'http://localhost:8000', // Cambia esto según tu configuración
    region: 'us-east-1' // Reemplaza esto con tu región deseada
});

const tableName = 'MenuQrUsersTable';

const deleteAllItems = async () => {
    try {
        const params = {
            TableName: tableName
        };

        const data = await dynamoDb.scan(params).promise();
        const items = data.Items;

        for (const item of items) {
            const deleteParams = {
                TableName: tableName,
                Key: {
                    PK: item.PK,
                    SK: item.SK
                }
            };
            await dynamoDb.delete(deleteParams).promise();
            console.log(`Deleted item: PK = ${item.PK}, SK = ${item.SK}`);
        }

        console.log('All items deleted successfully.');
    } catch (error) {
        console.error('Error deleting items:', error);
    }
};

deleteAllItems();
