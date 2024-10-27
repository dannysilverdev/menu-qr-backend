const AWS = require('aws-sdk');

// Configurar DynamoDB para que apunte al endpoint local
const dynamoDb = new AWS.DynamoDB({
    endpoint: 'http://localhost:8000', // Cambia el endpoint si estás en otro entorno
    region: 'us-east-1' // Cambia la región según corresponda
});

// Configuración de la tabla según el serverless.yml
const params = {
    TableName: 'MenuQrUsersTable', // Nombre de la tabla
    AttributeDefinitions: [
        { AttributeName: 'PK', AttributeType: 'S' },
        { AttributeName: 'SK', AttributeType: 'S' },
        { AttributeName: 'categoryId', AttributeType: 'S' }
    ],
    KeySchema: [
        { AttributeName: 'PK', KeyType: 'HASH' },
        { AttributeName: 'SK', KeyType: 'RANGE' }
    ],
    BillingMode: 'PAY_PER_REQUEST',
    GlobalSecondaryIndexes: [
        {
            IndexName: 'categoryId-index',
            KeySchema: [{ AttributeName: 'categoryId', KeyType: 'HASH' }],
            Projection: { ProjectionType: 'ALL' }
        }
    ]
};

// Crear la tabla en DynamoDB
dynamoDb.createTable(params, (err, data) => {
    if (err) {
        console.error('Error al crear la tabla:', err);
    } else {
        console.log('Tabla creada con éxito:', data);
    }
});
