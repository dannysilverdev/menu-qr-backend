import { APIGatewayProxyHandler } from 'aws-lambda';
import { jwtVerify } from 'jose';
import { v4 as uuidv4 } from 'uuid';
import { corsHeaders, USERS_TABLE, dynamoDb, JWT_SECRET } from './config.js';
import { PutCommand, DeleteCommand } from '@aws-sdk/lib-dynamodb';

// Función para verificar el token y extraer userId
const getUserIdFromToken = async (authHeader: string | undefined): Promise<string | null> => {
    if (!authHeader) return null;

    const token = authHeader.split(' ')[1];
    try {
        const jwtSecretKey = new TextEncoder().encode(JWT_SECRET);
        const { payload } = await jwtVerify(token, jwtSecretKey);
        return payload.userId as string | null;
    } catch (error) {
        console.error('Token verification failed:', error);
        return null;
    }
};

// ==========================================
// PRODUCTS MANAGEMENT
// ==========================================

/**
 * CREATE PRODUCT
 * Función para crear un producto en una categoría
 */
export const createProduct: APIGatewayProxyHandler = async (event) => {
    const { categoryId } = event.pathParameters || {};
    const authHeader = event.headers.Authorization || event.headers.authorization;

    if (!authHeader) {
        return {
            statusCode: 401,
            headers: corsHeaders,
            body: JSON.stringify({ message: 'Authorization header missing' }),
        };
    }

    const userId = await getUserIdFromToken(authHeader);
    if (!userId) {
        return {
            statusCode: 403,
            headers: corsHeaders,
            body: JSON.stringify({ message: 'Invalid or expired token' }),
        };
    }

    if (!categoryId) {
        return {
            statusCode: 400,
            headers: corsHeaders,
            body: JSON.stringify({ message: 'Category ID is required' }),
        };
    }

    const { productName, price, description } = JSON.parse(event.body || '{}');

    if (!productName || !price || !description) {
        return {
            statusCode: 400,
            headers: corsHeaders,
            body: JSON.stringify({ message: 'Product name, price, and description are required' }),
        };
    }

    const productId = uuidv4();
    const createdAt = new Date().toISOString();

    const params = {
        TableName: USERS_TABLE,
        Item: {
            PK: `USER#${userId}`,
            SK: `PRODUCT#${productId}`,
            categoryId: `CATEGORY#${categoryId}`,
            productName,
            price,
            description,
            createdAt,
        },
    };

    try {
        await dynamoDb.send(new PutCommand(params));
        return {
            statusCode: 201,
            headers: corsHeaders,
            body: JSON.stringify({
                message: 'Product created successfully',
                product: {
                    productName,
                    price,
                    description,
                    productId,
                    createdAt,
                },
            }),
        };
    } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
        console.error('Error creating product:', errorMessage);
        return {
            statusCode: 500,
            headers: corsHeaders,
            body: JSON.stringify({ message: 'Error creating product', error: errorMessage }),
        };
    }
};

/**
 * DELETE PRODUCT
 * Eliminar producto
 */
export const deleteProduct: APIGatewayProxyHandler = async (event) => {
    try {
        // Obtén parámetros y valida token
        const { categoryId, productId } = event.pathParameters || {};
        const authHeader = event.headers.Authorization || event.headers.authorization;

        if (!authHeader || !categoryId || !productId) {
            return {
                statusCode: 400,
                headers: corsHeaders,
                body: JSON.stringify({ message: 'Missing parameters or token' }),
            };
        }

        const userId = await getUserIdFromToken(authHeader);
        if (!userId) {
            return {
                statusCode: 403,
                headers: corsHeaders,
                body: JSON.stringify({ message: 'Invalid or expired token' }),
            };
        }

        // Configuración de eliminación
        const deleteParams = {
            TableName: USERS_TABLE,
            Key: {
                PK: `USER#${userId}`,
                SK: `PRODUCT#${productId}`,
            },
        };

        // Elimina producto de DynamoDB
        await dynamoDb.send(new DeleteCommand(deleteParams));
        return {
            statusCode: 200,
            headers: corsHeaders,
            body: JSON.stringify({ message: 'Product deleted successfully' }),
        };
    } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        console.error('Error in deleteProduct:', errorMessage);
        return {
            statusCode: 500,
            headers: corsHeaders,
            body: JSON.stringify({ message: 'Error deleting product', error: errorMessage }),
        };
    }
};
