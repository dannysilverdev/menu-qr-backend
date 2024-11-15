import { APIGatewayProxyHandler } from 'aws-lambda';
import { jwtVerify } from 'jose';
import { v4 as uuidv4 } from 'uuid';
import { corsHeaders, USERS_TABLE, dynamoDb, JWT_SECRET } from './config.js';
import { PutCommand, QueryCommand, DeleteCommand, BatchWriteCommand } from '@aws-sdk/lib-dynamodb';

// Type definitions
interface Product {
    productName: string;
    price: number;
    description: string;
    productId: string;
    createdAt: string;
    categoryId: string;
}

interface Category {
    categoryName: string;
    SK: string;
    products: Product[];
}

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
// CATEGORIES MANAGEMENT
// ==========================================

/**
 * CREATE CATEGORY
 * Función para crear una categoría
 */
export const createCategory: APIGatewayProxyHandler = async (event) => {
    const { userId, categoryName } = JSON.parse(event.body || '{}');
    const categoryId = uuidv4(); // Generar un ID único para la categoría

    const params = {
        TableName: USERS_TABLE,
        Item: {
            PK: `USER#${userId}`,  // Clave primaria del usuario
            SK: `CATEGORY#${categoryId}`, // Clave secundaria para la categoría
            categoryName, // Nombre de la categoría
            createdAt: new Date().toISOString(), // Fecha de creación
        },
    };

    try {
        await dynamoDb.send(new PutCommand(params));
        return {
            statusCode: 201,
            headers: corsHeaders,
            body: JSON.stringify({
                message: 'Category created successfully',
                categoryId, // Devuelve el ID de la categoría creada
                categoryName // Incluye el nombre de la categoría en la respuesta
            }),
        };
    } catch (error) {
        return {
            statusCode: 500,
            headers: corsHeaders,
            body: JSON.stringify({
                message: 'Error creating category',
                error: error instanceof Error ? error.message : 'Unknown error',
            }),
        };
    }
};

/**
 * GET CATEGORIES
 * Obtener Categorias con Productos
 */
export const getCategories: APIGatewayProxyHandler = async (event) => {
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

    const categoriesParams = {
        TableName: USERS_TABLE,
        KeyConditionExpression: 'PK = :pk and begins_with(SK, :skPrefix)',
        ExpressionAttributeValues: {
            ':pk': `USER#${userId}`,
            ':skPrefix': 'CATEGORY#',
        },
    };

    const productsParams = {
        TableName: USERS_TABLE,
        KeyConditionExpression: 'PK = :pk and begins_with(SK, :skPrefix)',
        ExpressionAttributeValues: {
            ':pk': `USER#${userId}`,
            ':skPrefix': 'PRODUCT#',
        },
    };

    try {
        const [categoriesResult, productsResult] = await Promise.all([
            dynamoDb.send(new QueryCommand(categoriesParams)),
            dynamoDb.send(new QueryCommand(productsParams))
        ]);

        const categories: Category[] = (categoriesResult.Items || []).map(item => ({
            categoryName: item.categoryName,
            SK: item.SK,
            products: [],
        }));

        const products: Product[] = (productsResult.Items || []).map((product: any) => ({
            productName: product.productName,
            price: product.price,
            description: product.description,
            productId: product.SK.split('#')[1],
            createdAt: product.createdAt,
            categoryId: product.categoryId,
        }));

        const categoryMap: { [key: string]: Product[] } = {};
        products.forEach(product => {
            const categoryKey = product.categoryId;
            if (!categoryMap[categoryKey]) {
                categoryMap[categoryKey] = [];
            }
            categoryMap[categoryKey].push(product);
        });

        const categoriesWithProducts: Category[] = categories.map(category => ({
            ...category,
            products: categoryMap[category.SK] || [],
        }));

        return {
            statusCode: 200,
            headers: corsHeaders,
            body: JSON.stringify({ categories: categoriesWithProducts }),
        };
    } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        return {
            statusCode: 500,
            headers: corsHeaders,
            body: JSON.stringify({ message: 'Could not retrieve categories and products', error: errorMessage }),
        };
    }
};

/**
 * DELETE CATEGORIES
 * Función para eliminar categoría y productos asociados
 */
export const deleteCategory: APIGatewayProxyHandler = async (event) => {
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

    const productQueryParams = {
        TableName: USERS_TABLE,
        IndexName: 'categoryId-index',
        KeyConditionExpression: 'categoryId = :categoryIdVal',
        ExpressionAttributeValues: {
            ':categoryIdVal': `CATEGORY#${categoryId}`,
        },
    };

    try {
        const productsResult = await dynamoDb.send(new QueryCommand(productQueryParams));
        const products = productsResult.Items || [];

        if (products.length > 0) {
            const deleteRequests = products.map((product) => ({
                DeleteRequest: {
                    Key: {
                        PK: product.PK,
                        SK: product.SK,
                    },
                },
            }));

            const batchDeleteParams = {
                RequestItems: {
                    [USERS_TABLE]: deleteRequests,
                },
            };

            await dynamoDb.send(new BatchWriteCommand(batchDeleteParams));
            console.log('Productos eliminados:', deleteRequests);
        }

        const deleteCategoryParams = {
            TableName: USERS_TABLE,
            Key: {
                PK: `USER#${userId}`,
                SK: `CATEGORY#${categoryId}`,
            },
        };

        await dynamoDb.send(new DeleteCommand(deleteCategoryParams));
        console.log('Categoría eliminada con éxito:', categoryId);

        return {
            statusCode: 200,
            headers: corsHeaders,
            body: JSON.stringify({ message: 'Category and associated products deleted successfully' }),
        };
    } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        console.error('Error deleting category and products:', errorMessage);
        return {
            statusCode: 500,
            body: JSON.stringify({ message: 'Error deleting category and products', error: errorMessage }),
        };
    }
};
