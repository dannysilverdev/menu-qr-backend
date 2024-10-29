import { APIGatewayProxyHandler } from 'aws-lambda';
import bcrypt from 'bcryptjs';
import { dynamoDb, USERS_TABLE } from './config';
import { JWT_SECRET, corsHeaders } from './config';
import jwt, { JwtPayload as DefaultJwtPayload } from 'jsonwebtoken';



// Función para registrar un nuevo usuario (signup)
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
        console.error('Error fetching user data:', error);
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

export const updateUser: APIGatewayProxyHandler = async (event) => {
    const userId = event.pathParameters?.userId;
    const { localName, description, phoneNumber, socialMedia } = JSON.parse(event.body || '{}');

    if (!userId || !localName || !phoneNumber) {
        return {
            statusCode: 400,
            headers: corsHeaders,
            body: JSON.stringify({ message: 'User ID, localName, and phoneNumber are required' }),
        };
    }

    const params = {
        TableName: USERS_TABLE,
        Key: {
            PK: `USER#${userId}`,
            SK: 'PROFILE',
        },
        UpdateExpression: 'SET localName = :localName, description = :description, phoneNumber = :phoneNumber, socialMedia = :socialMedia',
        ExpressionAttributeValues: {
            ':localName': localName,
            ':description': description || '',
            ':phoneNumber': phoneNumber,
            ':socialMedia': socialMedia || [],
        },
        ReturnValues: 'ALL_NEW',
    };

    try {
        const result = await dynamoDb.update(params).promise();
        return {
            statusCode: 200,
            headers: corsHeaders,
            body: JSON.stringify({ message: 'User updated successfully', updatedUser: result.Attributes }),
        };
    } catch (error) {
        console.error('Error updating user:', error);
        return {
            statusCode: 500,
            headers: corsHeaders,
            body: JSON.stringify({
                message: 'Error updating user',
                error: error instanceof Error ? error.message : 'Unknown error',
            }),
        };
    }
};

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
