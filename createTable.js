const AWS = require('aws-sdk');

// Configurar el endpoint de DynamoDB local
const dynamoDb = new AWS.DynamoDB({
    endpoint: 'http://localhost:8000', // Cambia el puerto si es necesario
    region: 'us-east-1', // Cambia a la región que prefieras
});

const params = {
    TableName: 'MenuQrUsersTable',
    AttributeDefinitions: [
        {
            AttributeName: 'PK',
            AttributeType: 'S',
        },
        {
            AttributeName: 'SK',
            AttributeType: 'S',
        },
    ],
    KeySchema: [
        {
            AttributeName: 'PK',
            KeyType: 'HASH',
        },
        {
            AttributeName: 'SK',
            KeyType: 'RANGE',
        },
    ],
    BillingMode: 'PAY_PER_REQUEST',
};

const createTable = async () => {
    try {
        const data = await dynamoDb.createTable(params).promise();
        console.log('Table created successfully:', data);
    } catch (error) {
        console.error('Error creating table:', error);
    }
};

createTable();
