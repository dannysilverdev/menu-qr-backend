import { APIGatewayProxyHandler } from 'aws-lambda';
import { USERS_TABLE } from './config';
import { JWT_SECRET, corsHeaders, dynamoDb } from './config';
import jwt, { JwtPayload as DefaultJwtPayload } from 'jsonwebtoken';
import { v4 as uuidv4 } from 'uuid';

// Función para crear un producto en una categoría
// Función para crear un producto en una categoría
export const createProduct: APIGatewayProxyHandler = async (event) => {
    const { categoryId } = event.pathParameters || {};
    const authHeader = event.headers.Authorization || event.headers.authorization;

    if (!authHeader) {
        return {
            statusCode: 401,
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
            body: JSON.stringify({ message: 'Invalid or expired token' }),
        };
    }

    if (!categoryId) {
        return {
            statusCode: 400,
            body: JSON.stringify({ message: 'Category ID is required' }),
        };
    }

    const { productName, price, description } = JSON.parse(event.body || '{}');

    if (!productName || !price || !description) {
        return {
            statusCode: 400,
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
            body: JSON.stringify({ message: 'Error creating product', error: errorMessage }),
        };
    }
};

// Función para actualizar un producto
export const updateProduct: APIGatewayProxyHandler = async (event) => {
    const { productId } = event.pathParameters || {};
    const { productName, price, description } = JSON.parse(event.body || '{}');
    const authHeader = event.headers.Authorization || event.headers.authorization;

    if (!authHeader) {
        return {
            statusCode: 401,
            headers: corsHeaders,
            body: JSON.stringify({ message: 'Authorization header missing' }),
        };
    }

    const token = authHeader.split(' ')[1];
    let userId;

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

    if (!productId || !productName || price == null || !description) {
        return {
            statusCode: 400,
            headers: corsHeaders,
            body: JSON.stringify({ message: 'Product ID, name, price, and description are required' }),
        };
    }

    const params = {
        TableName: USERS_TABLE,
        Key: {
            PK: `USER#${userId}`,
            SK: `PRODUCT#${productId}`,
        },
        UpdateExpression: 'SET productName = :productName, price = :price, description = :description',
        ExpressionAttributeValues: {
            ':productName': productName,
            ':price': price,
            ':description': description,
        },
        ReturnValues: 'UPDATED_NEW',
    };

    try {
        const result = await dynamoDb.update(params).promise();
        return {
            statusCode: 200,
            headers: corsHeaders,
            body: JSON.stringify({
                message: 'Product updated successfully',
                data: result.Attributes,
            }),
        };
    } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        console.error('Error updating product:', errorMessage);
        return {
            statusCode: 500,
            headers: corsHeaders,
            body: JSON.stringify({
                message: 'Error updating product',
                error: errorMessage,
            }),
        };
    }
};


// Eliminar producto
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

