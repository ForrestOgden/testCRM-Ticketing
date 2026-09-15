import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

const AAD = Buffer.from("msp-crm/integration-secret/v1", "utf8");

function encryptionKey() {
  const raw = process.env.APP_ENCRYPTION_KEY?.trim();
  if (!raw) throw new Error("APP_ENCRYPTION_KEY is required to encrypt integration credentials.");

  let key: Buffer;
  if (/^[a-f0-9]{64}$/i.test(raw)) key = Buffer.from(raw, "hex");
  else {
    const normalized = raw.startsWith("base64:") ? raw.slice(7) : raw;
    key = Buffer.from(normalized, "base64");
  }

  if (key.length !== 32) throw new Error("APP_ENCRYPTION_KEY must decode to exactly 32 bytes (64 hex characters or base64)." );
  return key;
}

export function secretStorageConfigured() {
  try {
    encryptionKey();
    return true;
  } catch {
    return false;
  }
}

export function encryptSecretMap(values: Record<string, string>) {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", encryptionKey(), iv);
  cipher.setAAD(AAD);
  const plaintext = Buffer.from(JSON.stringify(values), "utf8");
  const ciphertext = Buffer.concat([cipher.update(plaintext), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `v1.${iv.toString("base64url")}.${tag.toString("base64url")}.${ciphertext.toString("base64url")}`;
}

export function decryptSecretMap(value: string | null | undefined): Record<string, string> {
  if (!value) return {};
  const [version, ivRaw, tagRaw, ciphertextRaw] = value.split(".");
  if (version !== "v1" || !ivRaw || !tagRaw || !ciphertextRaw) throw new Error("Encrypted integration secret has an unsupported format.");

  const decipher = createDecipheriv("aes-256-gcm", encryptionKey(), Buffer.from(ivRaw, "base64url"));
  decipher.setAAD(AAD);
  decipher.setAuthTag(Buffer.from(tagRaw, "base64url"));
  const plaintext = Buffer.concat([
    decipher.update(Buffer.from(ciphertextRaw, "base64url")),
    decipher.final(),
  ]).toString("utf8");
  const parsed = JSON.parse(plaintext) as unknown;
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) throw new Error("Decrypted integration secret is not an object.");

  return Object.fromEntries(
    Object.entries(parsed as Record<string, unknown>)
      .filter((entry): entry is [string, string] => typeof entry[1] === "string")
  );
}
