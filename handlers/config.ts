import dotenv from 'dotenv';
dotenv.config({ path: './handlers/.env' });
import AWS from 'aws-sdk';

console.log("# # # # #  DynamoDB Endpoint:", process.env.DYNAMODB_ENDPOINT);


export const USERS_TABLE = `MenuQrUsersTable-${process.env.NODE_ENV || 'dev'}`;
console.log("USERS_TABLE:", USERS_TABLE);
export const JWT_SECRET = 'd84e25a4-f70b-42b8-a4e9-9c6a8e16a7c5';

// Detecta si está en producción (AWS Lambda) o en local (desarrollo)
const NODE_ENV = process.env.NODE_ENV || 'dev';
console.log("# # # # #  NODE_ENV:", NODE_ENV);

export const isProduction = NODE_ENV === 'production';
process.env.VITE_IS_PRODUCTION = isProduction.toString();

console.log("Is Production:", isProduction); // Debe ser false en desarrollo

export const dynamoDb = new AWS.DynamoDB.DocumentClient(
    !isProduction
        ? { endpoint: process.env.DYNAMODB_ENDPOINT || 'http://localhost:8000', region: 'us-east-1' }
        : {} // Configuración predeterminada para producción en AWS
);



// SCAN

dynamoDb.scan({ TableName: USERS_TABLE }, (err, data) => {
    if (err) {
        console.error("Error:", err);
    } else {
        console.log("Data from DynamoDB Local:", data);
    }
});


// Cabeceras CORS
export const corsHeaders = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
    "Access-Control-Allow-Credentials": true,
};