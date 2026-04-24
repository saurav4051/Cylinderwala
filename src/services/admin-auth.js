import crypto from "node:crypto";
import { config } from "../config.js";
import { db } from "../db.js";

const now = () => new Date().toISOString();

const hashSecret = (value) => {
  const salt = crypto.randomBytes(16).toString("hex");
  const derived = crypto.scryptSync(value, salt, 64).toString("hex");
  return `${salt}:${derived}`;
};

const verifySecret = (value, storedHash) => {
  if (!storedHash || !value) return false;
  const [salt, storedDerived] = storedHash.split(":");
  if (!salt || !storedDerived) return false;

  const derived = crypto.scryptSync(value, salt, 64).toString("hex");
  const actual = Buffer.from(derived, "hex");
  const expected = Buffer.from(storedDerived, "hex");

  return (
    actual.length === expected.length &&
    crypto.timingSafeEqual(actual, expected)
  );
};

export const ensureAdminAuth = async () => {
  if (db.data.adminAuth) {
    return db.data.adminAuth;
  }

  db.data.adminAuth = {
    username: config.admin.username,
    passwordHash: hashSecret(config.admin.password),
    recoveryQuestion:
      config.admin.recoveryQuestion ?? "What is your admin recovery phrase?",
    recoveryAnswerHash: hashSecret(
      config.admin.recoveryAnswer ?? "cylinderwala-recovery",
    ),
    updatedAt: now(),
  };
  await db.write();
  return db.data.adminAuth;
};

export const getAdminAuth = async () => ensureAdminAuth();

export const verifyAdminPassword = async ({ username, password }) => {
  const adminAuth = await ensureAdminAuth();
  return (
    username === adminAuth.username &&
    verifySecret(password, adminAuth.passwordHash)
  );
};

export const getAdminProfile = async () => {
  const adminAuth = await ensureAdminAuth();
  return {
    username: adminAuth.username,
    recoveryQuestion: adminAuth.recoveryQuestion,
    updatedAt: adminAuth.updatedAt,
  };
};

export const changeAdminPassword = async ({ currentPassword, newPassword }) => {
  const adminAuth = await ensureAdminAuth();
  if (!verifySecret(currentPassword, adminAuth.passwordHash)) {
    throw new Error("Current password is incorrect");
  }

  adminAuth.passwordHash = hashSecret(newPassword);
  adminAuth.updatedAt = now();
  await db.write();
  return getAdminProfile();
};

export const updateAdminRecovery = async ({
  recoveryQuestion,
  recoveryAnswer,
}) => {
  const adminAuth = await ensureAdminAuth();
  adminAuth.recoveryQuestion = recoveryQuestion;
  adminAuth.recoveryAnswerHash = hashSecret(recoveryAnswer);
  adminAuth.updatedAt = now();
  await db.write();
  return getAdminProfile();
};

export const startPasswordRecovery = async ({ username }) => {
  const adminAuth = await ensureAdminAuth();
  if (username !== adminAuth.username) {
    throw new Error("Admin username not found");
  }

  return {
    username: adminAuth.username,
    recoveryQuestion: adminAuth.recoveryQuestion,
  };
};

export const completePasswordRecovery = async ({
  username,
  recoveryAnswer,
  newPassword,
}) => {
  const adminAuth = await ensureAdminAuth();
  if (username !== adminAuth.username) {
    throw new Error("Admin username not found");
  }
  if (!verifySecret(recoveryAnswer, adminAuth.recoveryAnswerHash)) {
    throw new Error("Recovery answer is incorrect");
  }

  adminAuth.passwordHash = hashSecret(newPassword);
  adminAuth.updatedAt = now();
  await db.write();
  return getAdminProfile();
};
