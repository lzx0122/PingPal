import crypto from "crypto";

export const generateRandomPassword = (length: number = 16): string => {
  const uppercase = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";
  const lowercase = "abcdefghijklmnopqrstuvwxyz";
  const numbers = "0123456789";
  const symbols = "!@#$%^&*-_=+";
  const allChars = uppercase + lowercase + numbers + symbols;

  let password = "";

  password += uppercase[crypto.randomInt(0, uppercase.length)];
  password += lowercase[crypto.randomInt(0, lowercase.length)];
  password += numbers[crypto.randomInt(0, numbers.length)];
  password += symbols[crypto.randomInt(0, symbols.length)];

  for (let i = password.length; i < length; i++) {
    password += allChars[crypto.randomInt(0, allChars.length)];
  }

  return password
    .split("")
    .sort(() => crypto.randomInt(0, 2) - 0.5)
    .join("");
};
