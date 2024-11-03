import { APIGatewayProxyHandler } from 'aws-lambda';
import jwt, { JwtPayload as DefaultJwtPayload } from 'jsonwebtoken';
import { v4 as uuidv4 } from 'uuid';
import { corsHeaders, USERS_TABLE, dynamoDb, JWT_SECRET } from './config'

// ==========================================
// PRODUCTS
// ==========================================

/**
 * CREATE PRODUCTs
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

    const token = authHeader.split(' ')[1];
    let userId: string;

    try {
        const decoded = jwt.verify(token, JWT_SECRET) as DefaultJwtPayload;
        userId = decoded.userId;
    } catch (error) {
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
        await dynamoDb.put(params).promise();
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
        const token = event.headers.Authorization?.split(' ')[1];
        if (!token || !categoryId || !productId) throw new Error('Missing parameters or token');

        const { userId } = jwt.verify(token, JWT_SECRET) as { userId: string };
        if (!userId) throw new Error('Invalid token');

        // Configuración de eliminación
        const deleteParams = {
            TableName: USERS_TABLE,
            Key: {
                PK: `USER#${userId}`,
                SK: `CATEGORY#${categoryId}#PRODUCT#${productId}`
            }
        };

        // Elimina producto de DynamoDB
        await dynamoDb.delete(deleteParams).promise();
        return {
            statusCode: 200,
            body: JSON.stringify({ message: 'Product deleted successfully' })
        };
    } catch (error) {
        // Manejo del tipo de error
        const errorMessage = (error as Error).message || 'Unknown error';
        console.error('Error in deleteProduct:', errorMessage);
        return {
            statusCode: 500,
            body: JSON.stringify({ message: 'Error deleting product', error: errorMessage })
        };
    }
};