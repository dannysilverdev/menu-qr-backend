import { APIGatewayProxyHandler } from 'aws-lambda';
import { v4 as uuidv4 } from 'uuid';
import jwt, { JwtPayload as DefaultJwtPayload } from 'jsonwebtoken';
import { JWT_SECRET, USERS_TABLE, corsHeaders, dynamoDb } from './config';
import { CustomJwtPayload, Category, Product } from './types';

// Función para crear una categoría
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
        await dynamoDb.put(params).promise();
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

// Obtener Categorias con Productos
export const getCategories: APIGatewayProxyHandler = async (event) => {
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
        const decoded = jwt.verify(token, JWT_SECRET) as CustomJwtPayload;
        userId = decoded.userId;
    } catch (error) {
        return {
            statusCode: 403,
            headers: corsHeaders,
            body: JSON.stringify({ message: 'Invalid or expired token' }),
        };
    }

    // Obtener todas las categorías del usuario
    const categoriesParams = {
        TableName: USERS_TABLE,
        KeyConditionExpression: 'PK = :pk and begins_with(SK, :skPrefix)',
        ExpressionAttributeValues: {
            ':pk': `USER#${userId}`,
            ':skPrefix': 'CATEGORY#',
        },
    };

    // Obtener todos los productos del usuario en una sola consulta
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
            dynamoDb.query(categoriesParams).promise(),
            dynamoDb.query(productsParams).promise()
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
            categoryId: product.categoryId, // Incluir categoryId
        }));

        // Agrupar productos por categoría
        const categoryMap: { [key: string]: Product[] } = {};

        products.forEach(product => {
            const categoryKey = product.categoryId; // Asegúrate de que `categoryId` esté correctamente asignado
            if (!categoryMap[categoryKey]) {
                categoryMap[categoryKey] = [];
            }
            categoryMap[categoryKey].push(product);
        });

        // Asignar productos a sus respectivas categorías
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
        console.error('Error fetching categories and products:', errorMessage);
        return {
            statusCode: 500,
            headers: corsHeaders,
            body: JSON.stringify({ message: 'Could not retrieve categories and products', error: errorMessage }),
        };
    }
};


// Función para eliminar una categoría y sus productos asociados
// Función para eliminar categoría y productos asociados
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

    if (!categoryId) {
        return {
            statusCode: 400,
            headers: corsHeaders,
            body: JSON.stringify({ message: 'Category ID is required' }),
        };
    }

    // Consulta para obtener productos asociados utilizando el índice
    const productQueryParams = {
        TableName: USERS_TABLE,
        IndexName: 'categoryId-index',
        KeyConditionExpression: 'categoryId = :categoryIdVal',
        ExpressionAttributeValues: {
            ':categoryIdVal': `CATEGORY#${categoryId}`,
        },
    };

    try {
        // Obtener productos asociados
        const productsResult = await dynamoDb.query(productQueryParams).promise();
        const products = productsResult.Items || [];

        // Batch delete para eliminar productos asociados
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

            await dynamoDb.batchWrite(batchDeleteParams).promise();
            console.log('Productos eliminados:', deleteRequests);
        }

        // Eliminar la categoría
        const deleteCategoryParams = {
            TableName: USERS_TABLE,
            Key: {
                PK: `USER#${userId}`,
                SK: `CATEGORY#${categoryId}`,
            },
        };

        await dynamoDb.delete(deleteCategoryParams).promise();
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


// Función para actualizar el nombre de una categoría
export const updateCategory: APIGatewayProxyHandler = async (event) => {
    const { categoryId } = event.pathParameters || {};
    const { categoryName } = JSON.parse(event.body || '{}');
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

    if (!categoryId || !categoryName) {
        return {
            statusCode: 400,
            headers: corsHeaders,
            body: JSON.stringify({ message: 'Category ID and name are required' }),
        };
    }

    const params = {
        TableName: USERS_TABLE,
        Key: {
            PK: `USER#${userId}`,
            SK: `CATEGORY#${categoryId}`,
        },
        UpdateExpression: 'SET categoryName = :categoryName',
        ExpressionAttributeValues: {
            ':categoryName': categoryName,
        },
        ReturnValues: 'UPDATED_NEW',
    };

    try {
        const result = await dynamoDb.update(params).promise();
        return {
            statusCode: 200,
            headers: corsHeaders,
            body: JSON.stringify({
                message: 'Category updated successfully',
                data: result.Attributes,
            }),
        };
    } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        console.error('Error updating category:', errorMessage);
        return {
            statusCode: 500,
            headers: corsHeaders,
            body: JSON.stringify({
                message: 'Error updating category',
                error: errorMessage,
            }),
        };
    }
};