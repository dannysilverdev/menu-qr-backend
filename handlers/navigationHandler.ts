import { APIGatewayProxyHandler } from 'aws-lambda';
import { jwtVerify } from 'jose';
import { corsHeaders, USERS_TABLE, dynamoDb, JWT_SECRET } from './config.js';
import { QueryCommand } from '@aws-sdk/lib-dynamodb';

/**
 * Función para verificar un token JWT
 * @param token - El token JWT
 * @returns El payload decodificado si es válido, de lo contrario lanza un error
 */
const verifyToken = async (token: string) => {
    const jwtSecretKey = new TextEncoder().encode(JWT_SECRET);
    try {
        const { payload } = await jwtVerify(token, jwtSecretKey);
        return payload;
    } catch (error) {
        console.error('Token verification failed:', error);
        throw new Error('Unauthorized');
    }
};

// ==========================================
// NAVIGATION FUNCTIONS
// ==========================================

/**
 * Home
 */
export const home: APIGatewayProxyHandler = async (event) => {
    const authHeader = event.headers.Authorization || event.headers.authorization;

    if (!authHeader) {
        return {
            statusCode: 401,
            body: JSON.stringify({ message: 'Authorization header missing' }),
        };
    }

    const token = authHeader.split(' ')[1];

    try {
        await verifyToken(token);
        return {
            statusCode: 200,
            headers: corsHeaders,
            body: JSON.stringify({ message: 'Welcome to the protected home page!' }),
        };
    } catch (error) {
        return {
            statusCode: 403,
            headers: corsHeaders,
            body: JSON.stringify({ message: 'Invalid or expired token', error: error instanceof Error ? error.message : 'Unknown error' }),
        };
    }
};

/**
 * VIEW MENU FUNCTION
 * THIS IS A PUBLIC FUNCTION TO GET THE USER DATA AND ITEMS
 */
export const viewMenu: APIGatewayProxyHandler = async (event) => {
    const userId = event.pathParameters?.userId;
    console.log("Received userId:", userId);

    if (!userId) {
        return {
            statusCode: 400,
            headers: corsHeaders,
            body: JSON.stringify({
                message: "Missing userId in the request",
            }),
        };
    }

    try {
        // Consulta para obtener todas las categorías del usuario
        const categoryParams = {
            TableName: USERS_TABLE,
            KeyConditionExpression: "PK = :userId AND begins_with(SK, :categoryPrefix)",
            ExpressionAttributeValues: {
                ":userId": `USER#${userId}`,
                ":categoryPrefix": "CATEGORY#",
            },
        };

        const categoryResult = await dynamoDb.send(new QueryCommand(categoryParams));
        console.log("Fetched categories:", categoryResult.Items);

        // Itera sobre cada categoría y realiza una consulta para obtener sus productos
        const categoriesWithProducts = await Promise.all(
            categoryResult.Items?.map(async (categoryItem) => {
                const productsParams = {
                    TableName: USERS_TABLE,
                    IndexName: 'categoryId-index', // Si tienes un índice global secundario en categoryId
                    KeyConditionExpression: "categoryId = :categoryId AND begins_with(SK, :productPrefix)",
                    ExpressionAttributeValues: {
                        ":categoryId": categoryItem.SK,
                        ":productPrefix": "PRODUCT#",
                    },
                };

                const productsResult = await dynamoDb.send(new QueryCommand(productsParams));
                console.log(`Products for category ${categoryItem.categoryName}:`, productsResult.Items);

                // Mapea los productos recuperados
                const products = productsResult.Items
                    ?.map((productItem) => ({
                        productName: productItem.productName,
                        price: productItem.price,
                        description: productItem.description,
                        status: productItem.isActive,
                        productId: productItem.SK.split("#")[1],
                        order: productItem.order, // Incluye el atributo `order`
                    }))
                    .sort((a, b) => a.order - b.order) || [];

                return {
                    categoryName: categoryItem.categoryName,
                    SK: categoryItem.SK,
                    products: products,
                };
            }) || []
        );

        console.log("Final categories with products:", categoriesWithProducts);

        return {
            statusCode: 200,
            body: JSON.stringify({ categories: categoriesWithProducts }),
            headers: {
                "Access-Control-Allow-Origin": "*",
                "Access-Control-Allow-Credentials": "false",
            },
        };
    } catch (error) {
        console.error("Error fetching categories and products:", error);
        return {
            statusCode: 500,
            body: JSON.stringify({
                message: "Internal Server Error",
            }),
            headers: {
                "Access-Control-Allow-Origin": "*",
                "Access-Control-Allow-Credentials": "false",
            },
        };
    }
};
