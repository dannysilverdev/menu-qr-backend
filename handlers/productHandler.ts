import { APIGatewayProxyHandler } from 'aws-lambda';
import { jwtVerify } from 'jose';
import { v4 as uuidv4 } from 'uuid';
import { corsHeaders, USERS_TABLE, dynamoDb, JWT_SECRET } from './config.js';
import { PutCommand, DeleteCommand, ScanCommand, UpdateCommand } from '@aws-sdk/lib-dynamodb';

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

    const body = event.body ? JSON.parse(event.body) : {};
    const { productName, price, description } = body;

    if (!productName || !price || !description) {
        return {
            statusCode: 400,
            headers: corsHeaders,
            body: JSON.stringify({ message: 'Product name, price, and description are required' }),
        };
    }

    const productId = uuidv4();
    const createdAt = new Date().toISOString();

    const { Items: existingProducts } = await dynamoDb.send(
        new ScanCommand({
            TableName: USERS_TABLE,
            FilterExpression: "PK = :userId AND begins_with(SK, :productPrefix) AND categoryId = :categoryId",
            ExpressionAttributeValues: {
                ":userId": `USER#${userId}`,
                ":productPrefix": `PRODUCT#`,
                ":categoryId": `CATEGORY#${categoryId}`,
            },
        })
    );

    const order = (existingProducts?.length || 0) + 1;

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
            isActive: true,
            order,
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
                    isActive: true,
                    order,
                },
            }),
        };
    } catch (error) {
        console.error('Error creating product:', error);
        return {
            statusCode: 500,
            headers: corsHeaders,
            body: JSON.stringify({ message: 'Error creating product', error: error instanceof Error ? error.message : 'Unknown error' }),
        };
    }
};

/**
 * REORDER PRODUCTS
 */
export const reorderProducts: APIGatewayProxyHandler = async (event) => {
    const { categoryId } = event.pathParameters || {};
    const body = event.body ? JSON.parse(event.body) : {};
    const { products } = body; // Recibe un arreglo con productId y order
    const authHeader = event.headers.Authorization || event.headers.authorization;

    const userId = await getUserIdFromToken(authHeader);
    if (!userId || !categoryId || !products) {
        return {
            statusCode: 400,
            headers: corsHeaders,
            body: JSON.stringify({ message: 'Invalid input' }),
        };
    }

    if (!Array.isArray(products) || products.some(p => !p.productId || p.order === undefined)) {
        return {
            statusCode: 400,
            headers: corsHeaders,
            body: JSON.stringify({ message: 'Invalid products format' }),
        };
    }

    try {
        for (const { productId, order } of products) {
            const updateParams = {
                TableName: USERS_TABLE,
                Key: {
                    PK: `USER#${userId}`,
                    SK: `PRODUCT#${productId}`,
                },
                UpdateExpression: "SET #order = :order",
                ExpressionAttributeNames: {
                    "#order": "order",
                },
                ExpressionAttributeValues: {
                    ":order": order,
                },
            };
            await dynamoDb.send(new UpdateCommand(updateParams));
        }

        return {
            statusCode: 200,
            headers: corsHeaders,
            body: JSON.stringify({ message: 'Products reordered successfully' }),
        };
    } catch (error) {
        console.error('Error reordering products:', error);
        return {
            statusCode: 500,
            headers: corsHeaders,
            body: JSON.stringify({ message: 'Error reordering products', error: error instanceof Error ? error.message : 'Unknown error' }),
        };
    }
};
