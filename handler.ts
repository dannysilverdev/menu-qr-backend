import dotenv from 'dotenv';
import AWS from 'aws-sdk';
import { APIGatewayProxyHandler } from 'aws-lambda';
import bcrypt from 'bcryptjs';
import jwt, { JwtPayload as DefaultJwtPayload } from 'jsonwebtoken';
import { v4 as uuidv4 } from 'uuid';

// ==========================================
// CONFIGURATION AND SETUP
// ==========================================

dotenv.config({ path: '.env' });

// Environment variables and constants
const USERS_TABLE = `MenuQrUsersTable-${process.env.NODE_ENV || 'dev'}`;
const JWT_SECRET = 'd84e25a4-f70b-42b8-a4e9-9c6a8e16a7c5';
const NODE_ENV = process.env.NODE_ENV || 'dev';
const isProduction = NODE_ENV === 'production';
process.env.VITE_IS_PRODUCTION = isProduction.toString();

// DynamoDB configuration
const dynamoDb = new AWS.DynamoDB.DocumentClient(
    !isProduction
        ? { endpoint: process.env.DYNAMODB_ENDPOINT || 'http://localhost:8000', region: 'us-east-1' }
        : {}
);

// CORS headers configuration
const corsHeaders = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
    "Access-Control-Allow-Credentials": true,
};

// Type definitions
export interface CustomJwtPayload extends DefaultJwtPayload {
    userId: string;
}

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

// ==========================================
// AUTHENTICATION AND USER MANAGEMENT
// ==========================================

/**
 * User Registration Handler
 * Creates a new user account with hashed password and profile information
 */
export const signup: APIGatewayProxyHandler = async (event) => {
    const { username, password, localName, description, phoneNumber, socialMedia } = JSON.parse(event.body || '{}');

    if (!username || !password || !localName || !phoneNumber) {
        return {
            statusCode: 400,
            headers: corsHeaders,
            body: JSON.stringify({ message: 'Username, password, localName, and phoneNumber are required' }),
        };
    }

    const hashedPassword = await bcrypt.hash(password, 10);

    const params = {
        TableName: USERS_TABLE,
        Item: {
            PK: `USER#${username}`,
            SK: 'PROFILE',
            password: hashedPassword,
            localName,
            description: description || '', // Campo opcional
            phoneNumber,
            socialMedia: socialMedia || [], // Inicializar redes sociales como un array vacío si no se proporciona
        },
    };

    try {
        await dynamoDb.put(params).promise();
        return {
            statusCode: 201,
            headers: corsHeaders,
            body: JSON.stringify({ message: 'User created successfully' }),
        };
    } catch (error) {
        console.error('Error creating user:', error);
        return {
            statusCode: 500,
            headers: corsHeaders,
            body: JSON.stringify({
                message: 'Error creating user',
                error: error instanceof Error ? error.message : 'Unknown error',
            }),
        };
    }
};

/**
 * User Login Handler
 * Authenticates user and returns JWT token
 */
export const login: APIGatewayProxyHandler = async (event) => {
    const { username, password } = JSON.parse(event.body || '{}');

    if (!username || !password) {
        return {
            statusCode: 400,
            headers: corsHeaders,
            body: JSON.stringify({ message: 'Username and password are required' }),
        };
    }

    const params = {
        TableName: USERS_TABLE,
        Key: {
            PK: `USER#${username}`,
            SK: 'PROFILE'
        },
    };

    try {
        const { Item } = await dynamoDb.get(params).promise();

        // Asegúrate de que el objeto Item tenga la propiedad userId
        if (!Item || !(await bcrypt.compare(password, Item.password))) {
            return {
                statusCode: 401,
                headers: corsHeaders,
                body: JSON.stringify({ message: 'Invalid credentials' }),
            };
        }

        // Verifica que userId esté presente en Item
        const token = jwt.sign({ userId: username }, JWT_SECRET, { expiresIn: '1h' });

        return {
            statusCode: 200,
            headers: corsHeaders,
            body: JSON.stringify({ token }),
        };
    } catch (error: unknown) {
        const errorMessage = (error instanceof Error) ? error.message : 'Unknown error';
        return {
            statusCode: 500,
            headers: corsHeaders,
            body: JSON.stringify({ message: 'Error logging in', error: errorMessage }),
        };
    }
};

// ==========================================
// USER PROFILE MANAGEMENT
// ==========================================

/**
 * Get User Profile Handler
 * Retrieves user profile information
 */
export const getUser: APIGatewayProxyHandler = async (event) => {
    const userId = event.pathParameters?.userId;
    if (!userId) {
        return {
            statusCode: 400,
            headers: corsHeaders,
            body: JSON.stringify({ message: 'User ID is required' }),
        };
    }

    const params = {
        TableName: USERS_TABLE,
        Key: {
            PK: `USER#${userId}`,
            SK: 'PROFILE',
        },
    };

    try {
        const { Item } = await dynamoDb.get(params).promise();
        if (!Item) {
            return {
                statusCode: 404,
                headers: corsHeaders,
                body: JSON.stringify({ message: 'User not found' }),
            };
        }

        return {
            statusCode: 200,
            headers: corsHeaders,
            body: JSON.stringify(Item),
        };
    } catch (error) {
        //console.error('Error fetching user data:', error);
        return {
            statusCode: 500,
            headers: corsHeaders,
            body: JSON.stringify({
                message: 'Error fetching user data',
                error: error instanceof Error ? error.message : 'Unknown error',
            }),
        };
    }
};

/**
 * Update User Profile Handler
 * Updates user profile information
 */
// Guardado automatico para informacion de perfil
export const updateUserProfile: APIGatewayProxyHandler = async (event) => {
    const userId = event.pathParameters?.username; // Nombre de usuario desde la URL
    const token = event.headers?.Authorization?.split(' ')[1]; // Obtener el token JWT de los encabezados

    if (!userId || !token) {
        return {
            statusCode: 400,
            headers: corsHeaders,
            body: JSON.stringify({ message: 'User ID and token are required' }),
        };
    }

    // Verifica el token JWT
    try {
        jwt.verify(token, JWT_SECRET);
    } catch (error) {
        return {
            statusCode: 401,
            headers: corsHeaders,
            body: JSON.stringify({ message: 'Invalid token' }),
        };
    }

    // Parseamos los datos que queremos actualizar
    const updates = JSON.parse(event.body || '{}');
    const updateExpressions = [];
    const expressionAttributeValues: { [key: string]: any } = {};
    const expressionAttributeNames: { [key: string]: string } = {};

    // Construimos las expresiones de actualización de DynamoDB solo para los campos enviados
    for (const [key, value] of Object.entries(updates)) {
        updateExpressions.push(`#${key} = :${key}`);
        expressionAttributeValues[`:${key}`] = value;
        expressionAttributeNames[`#${key}`] = key;
    }

    if (updateExpressions.length === 0) {
        return {
            statusCode: 400,
            headers: corsHeaders,
            body: JSON.stringify({ message: 'No fields provided for update' }),
        };
    }

    const updateParams = {
        TableName: USERS_TABLE,
        Key: { PK: `USER#${userId}`, SK: 'PROFILE' },
        UpdateExpression: `SET ${updateExpressions.join(', ')}`,
        ExpressionAttributeValues: expressionAttributeValues,
        ExpressionAttributeNames: expressionAttributeNames,
        ReturnValues: 'UPDATED_NEW',
    };

    try {
        const result = await dynamoDb.update(updateParams).promise();
        return {
            statusCode: 200,
            headers: corsHeaders,
            body: JSON.stringify({
                message: 'User profile updated successfully',
                updatedAttributes: result.Attributes,
            }),
        };
    } catch (error) {
        console.error('Error updating user profile:', error);
        return {
            statusCode: 500,
            headers: corsHeaders,
            body: JSON.stringify({
                message: 'Error updating user profile',
                error: error instanceof Error ? error.message : 'Unknown error',
            }),
        };
    }
};




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

/////////////////////////////////////////////////////////


//  Actualizar categoria
export const updateItemField: APIGatewayProxyHandler = async (event) => {
    const { itemId, userId } = event.pathParameters || {};  // Obtener itemId y userId de pathParameters
    const body = JSON.parse(event.body || '{}');
    const { fieldName, fieldValue, type } = body;

    // Validación de campos requeridos
    if (!itemId || !userId || !fieldName || fieldValue === undefined || !type) {
        //console.log("Faltan campos requeridos:", { itemId, userId, fieldName, fieldValue, type });
        return {
            statusCode: 400,
            body: JSON.stringify({ message: 'Missing required fields' }),
        };
    }

    // Definir las claves PK y SK para la categoría o producto
    const itemKey = type === 'category' ? `USER#${userId}` : `CATEGORY#${userId}`;
    const sortKey = type === 'category' ? `CATEGORY#${itemId}` : `PRODUCT#${itemId}`;

    // Configuración de los parámetros de actualización para el campo específico
    const params = {
        TableName: USERS_TABLE,
        Key: {
            PK: itemKey,
            SK: sortKey,
        },
        UpdateExpression: `SET ${fieldName} = :fieldValue`,  // Actualizar el campo indicado
        ExpressionAttributeValues: {
            ':fieldValue': fieldValue,  // Nuevo valor del campo
        },
        ReturnValues: 'UPDATED_NEW',
    };

    try {
        console.log("Actualizando item en DynamoDB:", params);
        const result = await dynamoDb.update(params).promise();
        //console.log("Resultado de la actualización:", result);
        return {
            statusCode: 200,
            body: JSON.stringify({
                message: `${type} updated successfully`,
                updatedAttributes: result.Attributes,
            }),
        };
    } catch (error) {
        //console.error("Error al actualizar el item:", error);
        return {
            statusCode: 500,
            body: JSON.stringify({
                message: `Error updating ${type}`,
                error: error instanceof Error ? error.message : 'Unknown error',
            }),
        };
    }
};




// ==========================================
// CATEGORIES
// ==========================================

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
        //console.error('Error fetching categories and products:', errorMessage);
        return {
            statusCode: 500,
            headers: corsHeaders,
            body: JSON.stringify({ message: 'Could not retrieve categories and products', error: errorMessage }),
        };
    }
};


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




// ==========================================
// PRODUCTS
// ==========================================

// Función para crear un producto en una categoría
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