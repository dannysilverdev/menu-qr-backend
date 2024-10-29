import { APIGatewayProxyHandler } from 'aws-lambda';
import bcrypt from 'bcryptjs';
import { dynamoDb, USERS_TABLE } from './config';
import { JWT_SECRET, corsHeaders } from './config';
import jwt, { JwtPayload as DefaultJwtPayload } from 'jsonwebtoken';



// Función para registrar un nuevo usuario (signup)
export const signup: APIGatewayProxyHandler = async (event) => {
    const { username, password } = JSON.parse(event.body || '{}');
    console.log(process.env.USERS_TABLE)

    if (!username || !password) {
        return {
            statusCode: 400,
            headers: corsHeaders,
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
            headers: corsHeaders,
            body: JSON.stringify({ message: 'User created successfully' }),
        };
    } catch (error) {
        console.error('Error creating user:', error); // Agregar un log para errores
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

// Funcion de inicio de sesion
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

// Función para eliminar un usuario y sus asociaciones
export const deleteUser: APIGatewayProxyHandler = async (event) => {
    const userId = event.pathParameters?.userId;
    if (!userId) {
        return {
            statusCode: 400,
            headers: corsHeaders,
            body: JSON.stringify({ message: 'User ID is required' }),
        };
    }

    const userKey = `USER#${userId}`;
    try {
        // Paso 1: Obtener todas las categorías y productos asociados al usuario
        const params = {
            TableName: USERS_TABLE,
            KeyConditionExpression: 'PK = :userKey',
            ExpressionAttributeValues: {
                ':userKey': userKey,
            },
        };

        const { Items: associatedItems } = await dynamoDb.query(params).promise();

        if (associatedItems && associatedItems.length > 0) {
            // Paso 2: Preparar un batch delete para categorías y productos asociados
            const deleteRequests = associatedItems.map(item => ({
                DeleteRequest: {
                    Key: {
                        PK: item.PK,
                        SK: item.SK,
                    },
                },
            }));

            // DynamoDB BatchWrite permite un máximo de 25 eliminaciones a la vez
            while (deleteRequests.length) {
                const batch = deleteRequests.splice(0, 25);
                await dynamoDb.batchWrite({
                    RequestItems: {
                        [USERS_TABLE]: batch,
                    },
                }).promise();
            }
        }

        // Paso 3: Eliminar el perfil del usuario después de eliminar sus asociaciones
        await dynamoDb.delete({
            TableName: USERS_TABLE,
            Key: {
                PK: userKey,
                SK: 'PROFILE',
            },
        }).promise();

        return {
            statusCode: 200,
            headers: corsHeaders,
            body: JSON.stringify({ message: 'User and all associations deleted successfully' }),
        };
    } catch (error) {
        console.error('Error deleting user and associations:', error);
        return {
            statusCode: 500,
            headers: corsHeaders,
            body: JSON.stringify({
                message: 'Error deleting user',
                error: error instanceof Error ? error.message : 'Unknown error',
            }),
        };
    }
};