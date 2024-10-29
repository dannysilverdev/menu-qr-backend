import { APIGatewayProxyHandler } from 'aws-lambda';
import { JWT_SECRET, corsHeaders, USERS_TABLE, dynamoDb } from './config';
import jwt, { JwtPayload as DefaultJwtPayload } from 'jsonwebtoken';

// Definir interfaces
interface Product {
    productName: string;
    price: number;
    description: string;
    productId: string;
    createdAt: string;
    categoryId: string;
}

interface Category {
    categoryId: string;
    categoryName: string;
    SK: string;
    products: Product[];
}

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
        jwt.verify(token, JWT_SECRET);
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

// Expone una ruta pública para visualizar el menú
export const viewMenu: APIGatewayProxyHandler = async (event) => {
    const userId = event.pathParameters?.userId;
    console.log("Received userId:", userId);

    if (!userId) {
        return {
            statusCode: 400,
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

        const categoryResult = await dynamoDb.query(categoryParams).promise();
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

                const productsResult = await dynamoDb.query(productsParams).promise();
                console.log(`Products for category ${categoryItem.categoryName}:`, productsResult.Items);

                // Mapea los productos recuperados
                const products = productsResult.Items?.map((productItem) => ({
                    productName: productItem.productName,
                    price: productItem.price,
                    description: productItem.description,
                    productId: productItem.SK.split("#")[1],
                })) || [];

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


export const menu: APIGatewayProxyHandler = async (event) => {
    const authHeader = event.headers.Authorization || event.headers.authorization;

    if (!authHeader) {
        return {
            statusCode: 401,
            body: JSON.stringify({ message: 'Authorization header missing' }),
        };
    }

    const token = authHeader.split(' ')[1];

    try {
        const decoded = jwt.verify(token, JWT_SECRET) as DefaultJwtPayload; // Asegúrate de que es un JwtPayload

        // Verifica si userId está presente en el token decodificado
        if (!decoded.userId) {
            return {
                statusCode: 403,
                headers: corsHeaders,
                body: JSON.stringify({ message: 'Invalid token: userId not found' }),
            };
        }

        return {
            statusCode: 200,
            headers: corsHeaders,
            body: JSON.stringify({ message: 'Welcome to the menu page!', userId: decoded.userId }), // Devuelve el userId
        };
    } catch (error) {
        return {
            statusCode: 403,
            headers: corsHeaders,
            body: JSON.stringify({ message: 'Invalid or expired token' }),
        };
    }
};