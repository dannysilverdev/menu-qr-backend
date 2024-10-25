import { APIGatewayProxyHandler } from 'aws-lambda';
import AWS from 'aws-sdk';
import bcrypt from 'bcryptjs';
import jwt, { JwtPayload } from 'jsonwebtoken'; // Importar JwtPayload
import { v4 as uuidv4 } from 'uuid';

const dynamoDb = new AWS.DynamoDB.DocumentClient({
    endpoint: 'http://localhost:8000', // Agregar esta línea para conectar a DynamoDB local
});

const USERS_TABLE = process.env.VITE_USERS_TABLE || 'MenuQrUsersTable';
const JWT_SECRET = process.env.VITE_JWT_SECRET || 'd84e25a4-f70b-42b8-a4e9-9c6a8e16a7c5'; // Debería estar en variables de entorno

// Cabeceras CORS
const corsHeaders = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
    "Access-Control-Allow-Credentials": true,
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
        const decoded = jwt.verify(token, JWT_SECRET) as JwtPayload; // Asegúrate de que es un JwtPayload

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

// Función para registrar un nuevo usuario (signup)
export const signup: APIGatewayProxyHandler = async (event) => {
    const { username, password } = JSON.parse(event.body || '{}');

    if (!username || !password) {
        return {
            statusCode: 400,
            body: JSON.stringify({ message: 'Username and password are required' }),
        };
    }

    const hashedPassword = await bcrypt.hash(password, 10);

    const params = {
        TableName: USERS_TABLE,
        Item: {
            PK: `USER#${username}`, // Establecer PK
            SK: 'PROFILE', // Establecer SK
            password: hashedPassword, // Almacenar la contraseña hasheada
        },
    };

    try {
        await dynamoDb.put(params).promise();
        return {
            statusCode: 201,
            body: JSON.stringify({ message: 'User created successfully' }),
        };
    } catch (error) {
        console.error('Error creating user:', error); // Agregar un log para errores
        return {
            statusCode: 500,
            headers: {
                "Access-Control-Allow-Origin": "*",
                "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
                "Access-Control-Allow-Headers": "Content-Type, Authorization",
                "Access-Control-Allow-Credentials": true,
            },
            body: JSON.stringify({
                message: 'Error creating user',
                error: error instanceof Error ? error.message : 'Unknown error',
            }),
        };
    }
};

export const login: APIGatewayProxyHandler = async (event) => {
    const { username, password } = JSON.parse(event.body || '{}');

    if (!username || !password) {
        return {
            statusCode: 400,
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
                body: JSON.stringify({ message: 'Invalid credentials' }),
            };
        }

        // Verifica que userId esté presente en Item
        const token = jwt.sign({ userId: username }, JWT_SECRET, { expiresIn: '1h' });

        return {
            statusCode: 200,
            body: JSON.stringify({ token }),
        };
    } catch (error: unknown) {
        const errorMessage = (error instanceof Error) ? error.message : 'Unknown error';
        return {
            statusCode: 500,
            body: JSON.stringify({ message: 'Error logging in', error: errorMessage }),
        };
    }
};


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
            body: JSON.stringify({ message: 'Category created successfully', categoryId }),
        };
    } catch (error) {
        return {
            statusCode: 500,
            headers: corsHeaders,
            body: JSON.stringify({ message: 'Error creating category', error: error instanceof Error ? error.message : 'Unknown error' }),
        };
    }
};

// Función para crear un producto
export const createProduct: APIGatewayProxyHandler = async (event) => {
    const { userId, categoryId, productName, price, description } = JSON.parse(event.body || '{}');
    const productId = uuidv4(); // Generar un ID único para el producto

    const params = {
        TableName: USERS_TABLE,
        Item: {
            PK: `USER#${userId}`,  // Clave primaria del usuario
            SK: `CATEGORY#${categoryId}#PRODUCT#${productId}`, // Clave secundaria para el producto
            productName,
            price,
            description,
            createdAt: new Date().toISOString(), // Fecha de creación
        },
    };

    try {
        await dynamoDb.put(params).promise();
        return {
            statusCode: 201,
            headers: corsHeaders,
            body: JSON.stringify({ message: 'Product created successfully', productId }),
        };
    } catch (error) {
        return {
            statusCode: 500,
            headers: corsHeaders,
            body: JSON.stringify({ message: 'Error creating product', error: error instanceof Error ? error.message : 'Unknown error' }),
        };
    }
};

// Función para obtener todas las categorías de un usuario
export const getCategories: APIGatewayProxyHandler = async (event) => {
    const { userId } = event.pathParameters || {}; // Obtener el userId

    if (!userId) {
        return {
            statusCode: 400,
            headers: corsHeaders,
            body: JSON.stringify({ message: 'userId is required' }),
        };
    }

    const params = {
        TableName: USERS_TABLE,
        KeyConditionExpression: 'PK = :userId AND begins_with(SK, :categoryPrefix)',
        ExpressionAttributeValues: {
            ':userId': `USER#${userId}`,          // Usar la PK correcta
            ':categoryPrefix': 'CATEGORY#', // Usar un prefijo para la SK
        },
    };

    try {
        const result = await dynamoDb.query(params).promise();

        if (!result.Items || result.Items.length === 0) {
            return {
                statusCode: 200,
                headers: corsHeaders,
                body: JSON.stringify({ categories: [] }), // Devuelve un array vacío si no hay categorías
            };
        }

        return {
            statusCode: 200,
            headers: corsHeaders,
            body: JSON.stringify({ categories: result.Items }),
        };
    } catch (error) {
        console.error('Error fetching categories:', error); // Añadir log para más detalles
        return {
            statusCode: 500,
            headers: corsHeaders,
            body: JSON.stringify({
                message: 'Could not retrieve categories',
                error: error instanceof Error ? error.message : 'Unknown error',
            }),
        };
    }
};

// Función para obtener los productos de una categoría específica
export const getProducts: APIGatewayProxyHandler = async (event) => {
    const { userId, categoryId } = event.pathParameters || {};

    if (!userId || !categoryId) {
        return {
            statusCode: 400,
            headers: corsHeaders,
            body: JSON.stringify({ message: 'userId and categoryId are required' }),
        };
    }

    const params = {
        TableName: USERS_TABLE,
        KeyConditionExpression: 'PK = :userId and begins_with(SK, :productPrefix)',
        ExpressionAttributeValues: {
            ':userId': `USER#${userId}`,
            ':productPrefix': `CATEGORY#${categoryId}#PRODUCT#`,
        },
    };

    try {
        const result = await dynamoDb.query(params).promise();
        if (!result.Items || result.Items.length === 0) {
            return {
                statusCode: 404,
                headers: corsHeaders,
                body: JSON.stringify({ message: 'No products found' }),
            };
        }
        return {
            statusCode: 200,
            headers: corsHeaders,
            body: JSON.stringify({ products: result.Items }),
        };
    } catch (error) {
        return {
            statusCode: 500,
            headers: corsHeaders,
            body: JSON.stringify({ message: 'Could not retrieve products', error: error instanceof Error ? error.message : 'Unknown error' }),
        };
    }
};
