import { APIGatewayProxyHandler } from 'aws-lambda';
import AWS from 'aws-sdk';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';

const dynamoDb = new AWS.DynamoDB.DocumentClient();
const USERS_TABLE = process.env.USERS_TABLE || 'MenuQrUsersTable';
const JWT_SECRET = 'd84e25a4-f70b-42b8-a4e9-9c6a8e16a7c5';

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
        // Verificar el token JWT
        jwt.verify(token, JWT_SECRET);
        return {
            statusCode: 200,
            body: JSON.stringify({ message: 'Welcome to the protected home page2!' }),
        };
    } catch (error) {
        return {
            statusCode: 403,
            body: JSON.stringify({ message: 'Invalid or expired token', error: error instanceof Error ? error.message : 'Unknown error' }),
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
            userId: username,
            password: hashedPassword,
        },
    };

    try {
        await dynamoDb.put(params).promise();
        return {
            statusCode: 201,
            body: JSON.stringify({ message: 'User created successfully' }),
        };
    } catch (error) {
        if (error instanceof Error) {
            return {
                statusCode: 500,
                headers: {
                    "Access-Control-Allow-Origin": "*",
                    "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
                    "Access-Control-Allow-Headers": "Content-Type, Authorization",
                    "Access-Control-Allow-Credentials": true,
                },
                body: JSON.stringify({ message: 'Error creating user', error: error.message }),
            };
        }

        return {
            statusCode: 500,
            headers: {
                "Access-Control-Allow-Origin": "*",
                "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
                "Access-Control-Allow-Headers": "Content-Type, Authorization",
                "Access-Control-Allow-Credentials": true,
            },
            body: JSON.stringify({ message: 'Unknown error while creating user' }),
        };
    }
};

// Función para iniciar sesión (login) con JWT y cabeceras CORS
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
            userId: username,
        },
    };

    try {
        const { Item } = await dynamoDb.get(params).promise();

        if (!Item || !(await bcrypt.compare(password, Item.password))) {
            return {
                statusCode: 401,
                headers: {
                    "Access-Control-Allow-Origin": "*",
                    "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
                    "Access-Control-Allow-Headers": "Content-Type, Authorization",
                    "Access-Control-Allow-Credentials": true,
                },
                body: JSON.stringify({ message: 'Invalid credentials' }),
            };
        }

        // Generar un token JWT con el userId del usuario
        const token = jwt.sign({ userId: Item.userId }, JWT_SECRET, { expiresIn: '1h' });

        return {
            statusCode: 200,
            headers: {
                "Access-Control-Allow-Origin": "*",  // Permitir todos los orígenes
                "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
                "Access-Control-Allow-Headers": "Content-Type, Authorization",
                "Access-Control-Allow-Credentials": true,
            },
            body: JSON.stringify({ token }),
        };
    } catch (error) {
        if (error instanceof Error) {
            return {
                statusCode: 500,
                headers: {
                    "Access-Control-Allow-Origin": "*",
                    "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
                    "Access-Control-Allow-Headers": "Content-Type, Authorization",
                    "Access-Control-Allow-Credentials": true,
                },
                body: JSON.stringify({ message: 'Error al iniciar sesión', error: error.message }),
            };
        }

        return {
            statusCode: 500,
            headers: {
                "Access-Control-Allow-Origin": "*",
                "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
                "Access-Control-Allow-Headers": "Content-Type, Authorization",
                "Access-Control-Allow-Credentials": true,
            },
            body: JSON.stringify({ message: 'Unknown error while logging in' }),
        };
    }
};
