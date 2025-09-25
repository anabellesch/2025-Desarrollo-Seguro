import jwt from 'jsonwebtoken';

const generateToken = (userId: string) => {
  const jwtSecret = process.env.JWT_SECRET;
  if (!jwtSecret) {
    throw new Error('JWT_SECRET environment variable is not set');
  }
  
  return jwt.sign(
    { id: userId }, 
    jwtSecret,  
    { expiresIn: '1h' }
  );
};

const verifyToken = (token: string) => {
  const jwtSecret = process.env.JWT_SECRET;
  if (!jwtSecret) {
    throw new Error('JWT_SECRET environment variable is not set');
  }
  
  return jwt.verify(token, jwtSecret);  
};



export default {
  generateToken,
  verifyToken
}