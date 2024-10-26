const AWS = require('aws-sdk');

const dynamoDb = new AWS.DynamoDB.DocumentClient({
    endpoint: 'http://localhost:8000', // Cambia esto si estás usando un endpoint diferente
    region: 'us-east-1' // Reemplaza esto con tu región deseada
});

const tableName = 'MenuQrUsersTable';

const viewAllItems = async () => {
    try {
        const params = {
            TableName: tableName
        };

        const data = await dynamoDb.scan(params).promise();
        const items = data.Items;

        console.log('Items in the table:', items);

        if (items.length === 0) {
            console.log('No items found in the table.');
        }
    } catch (error) {
        console.error('Error fetching items:', error);
    }
};

viewAllItems();
