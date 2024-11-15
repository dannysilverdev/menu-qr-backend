import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient } from '@aws-sdk/lib-dynamodb';

// Solo carga dotenv en entornos que no son de producción
if (process.env.NODE_ENV !== 'production') {
    import('dotenv').then((dotenv) => {
        dotenv.config({ path: '.env' });
    });
}

// Environment variables and constants
export const USERS_TABLE = `MenuQrUsersTable-${process.env.NODE_ENV || 'dev'}`;
export const JWT_SECRET = 'd84e25a4-f70b-42b8-a4e9-9c6a8e16a7c5';
const NODE_ENV = process.env.NODE_ENV || 'dev';
export const BUCKET_NAME = process.env.BUCKET_NAME || 'mi-bucket-de-pruebas';
const isProduction = NODE_ENV === 'production';
process.env.VITE_IS_PRODUCTION = isProduction.toString();

// DynamoDB client configuration
const dynamoDbClient = new DynamoDBClient(
    !isProduction
        ? { endpoint: process.env.DYNAMODB_ENDPOINT || 'http://localhost:8000', region: 'us-east-1' }
        : {}
);

// Create DynamoDBDocumentClient for high-level API
export const dynamoDb = DynamoDBDocumentClient.from(dynamoDbClient);

// CORS headers configuration
export const corsHeaders = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
    "Access-Control-Allow-Credentials": true,
};
