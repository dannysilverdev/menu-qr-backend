import { APIGatewayProxyHandler } from 'aws-lambda';
import { jwtVerify } from 'jose';
import { v4 as uuidv4 } from 'uuid';
import { corsHeaders, USERS_TABLE, dynamoDb, JWT_SECRET } from './config.js';
import { PutCommand, QueryCommand, DeleteCommand, BatchWriteCommand, UpdateCommand } from '@aws-sdk/lib-dynamodb';

// Type definitions
interface Product {
    productName: string;
    price: number;
    description: string;
    productId: string;
    createdAt: string;
    categoryId: string;
    isActive: boolean;
}

interface Category {
    categoryName: string;
    SK: string;
    products: Product[];
    order: number; // Nuevo campo
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

    if (!userId || !categoryName) {
        return {
            statusCode: 400,
            headers: corsHeaders,
            body: JSON.stringify({
                message: 'Missing userId or categoryName in the request',
            }),
        };
    }

    try {
        // Obtener el número de categorías actuales para calcular el orden
        const categoriesParams = {
            TableName: USERS_TABLE,
            KeyConditionExpression: 'PK = :pk AND begins_with(SK, :skPrefix)',
            ExpressionAttributeValues: {
                ':pk': `USER#${userId}`,
                ':skPrefix': 'CATEGORY#',
            },
        };

        const categoriesResult = await dynamoDb.send(new QueryCommand(categoriesParams));
        const currentCategoriesCount = categoriesResult.Items?.length || 0;

        // Asignar el orden como el siguiente índice
        const order = currentCategoriesCount + 1;

        const categoryId = uuidv4(); // Generar un ID único para la categoría

        const params = {
            TableName: USERS_TABLE,
            Item: {
                PK: `USER#${userId}`, // Clave primaria del usuario
                SK: `CATEGORY#${categoryId}`, // Clave secundaria para la categoría
                categoryName, // Nombre de la categoría
                order, // Número de orden de la categoría
                createdAt: new Date().toISOString(), // Fecha de creación
            },
        };

        await dynamoDb.send(new PutCommand(params));

        return {
            statusCode: 201,
            headers: corsHeaders,
            body: JSON.stringify({
                message: 'Category created successfully',
                categoryId,
                categoryName,
                order,
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
            order: item.order, // Incluir el campo "order"
        }));

        const products: Product[] = (productsResult.Items || []).map((product: any) => ({
            productName: product.productName,
            price: product.price,
            description: product.description,
            productId: product.SK.split('#')[1],
            createdAt: product.createdAt,
            categoryId: product.categoryId,
            isActive: product.isActive === undefined ? true : product.isActive,
            order: product.order,
        }));

        // Organizar productos por categoría
        const categoryMap: { [key: string]: Product[] } = {};
        products.forEach(product => {
            const categoryKey = product.categoryId;
            if (!categoryMap[categoryKey]) {
                categoryMap[categoryKey] = [];
            }
            categoryMap[categoryKey].push(product);
        });

        // Asignar productos a sus categorías correspondientes
        const categoriesWithProducts: Category[] = categories.map(category => ({
            ...category,
            products: (categoryMap[category.SK] || []).map(product => ({
                ...product,
                isActive: product.isActive ?? true // Asegurar que isActive tenga un valor por defecto
            })),
        }));

        // Ordenar las categorías por el campo "order"
        categoriesWithProducts.sort((a, b) => a.order - b.order);

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

export const reorderCategories: APIGatewayProxyHandler = async (event) => {
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

    const { categories } = JSON.parse(event.body || '{}'); // Espera un arreglo con categoryId y order

    if (!categories || !Array.isArray(categories)) {
        return {
            statusCode: 400,
            headers: corsHeaders,
            body: JSON.stringify({ message: 'Invalid input' }),
        };
    }

    try {
        for (const { categoryId, order } of categories) {
            const updateParams = {
                TableName: USERS_TABLE,
                Key: {
                    PK: `USER#${userId}`,
                    SK: `CATEGORY#${categoryId}`,
                },
                UpdateExpression: 'SET #order = :order',
                ExpressionAttributeNames: {
                    '#order': 'order',
                },
                ExpressionAttributeValues: {
                    ':order': order,
                },
            };

            await dynamoDb.send(new UpdateCommand(updateParams));
        }

        return {
            statusCode: 200,
            headers: corsHeaders,
            body: JSON.stringify({ message: 'Categories reordered successfully' }),
        };
    } catch (error) {
        console.error('Error reordering categories:', error);
        return {
            statusCode: 500,
            headers: corsHeaders,
            body: JSON.stringify({ message: 'Error reordering categories' }),
        };
    }
};
