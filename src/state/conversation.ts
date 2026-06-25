// In-memory storage (resets on restart). Swap for DynamoDB/Redis for persistence.

const CONVERSATION_TTL_MS = 60 * 60 * 1000; // 1 hour
const MAX_MESSAGES = 20;

export interface StoredMessage {
  role: 'user' | 'assistant';
  content: string;
  handle?: string;
}

interface ConversationRecord {
  messages: StoredMessage[];
  expiresAt: number;
}

const conversations = new Map<string, ConversationRecord>();
const userProfiles = new Map<string, UserProfile>();

export interface UserProfile {
  handle: string;
  name: string | null;
  facts: string[];
  firstSeen: number;
  lastSeen: number;
}

function pruneExpired(): void {
  const now = Date.now();
  for (const [key, record] of conversations) {
    if (record.expiresAt < now) conversations.delete(key);
  }
}

export async function getConversation(chatId: string): Promise<StoredMessage[]> {
  pruneExpired();
  return conversations.get(chatId)?.messages ?? [];
}

export async function addMessage(chatId: string, role: 'user' | 'assistant', content: string, handle?: string): Promise<void> {
  const messages = await getConversation(chatId);
  const newMessage: StoredMessage = { role, content };
  if (handle) newMessage.handle = handle;
  messages.push(newMessage);

  conversations.set(chatId, {
    messages: messages.slice(-MAX_MESSAGES),
    expiresAt: Date.now() + CONVERSATION_TTL_MS,
  });
}

export async function clearConversation(chatId: string): Promise<void> {
  conversations.delete(chatId);
}

export async function clearAllConversations(): Promise<void> {
  conversations.clear();
}

export async function getUserProfile(handle: string): Promise<UserProfile | null> {
  return userProfiles.get(handle) ?? null;
}

export async function updateUserProfile(handle: string, updates: { name?: string; facts?: string[] }): Promise<void> {
  const now = Math.floor(Date.now() / 1000);
  const existing = userProfiles.get(handle);

  userProfiles.set(handle, {
    handle,
    name: updates.name ?? existing?.name ?? null,
    facts: updates.facts ?? existing?.facts ?? [],
    firstSeen: existing?.firstSeen ?? now,
    lastSeen: now,
  });

  const profile = userProfiles.get(handle)!;
  console.log(`[conversation] Updated profile for ${handle}: name=${profile.name}, facts=${profile.facts.length}`);
}

export async function addUserFact(handle: string, fact: string): Promise<boolean> {
  const existing = await getUserProfile(handle);
  const facts = existing?.facts ?? [];

  if (!facts.includes(fact)) {
    facts.push(fact);
    await updateUserProfile(handle, { facts });
    console.log(`[conversation] Added fact for ${handle}: "${fact}"`);
    return true;
  }
  console.log(`[conversation] Fact for ${handle} already exists, skipping: "${fact}"`);
  return false;
}

export async function setUserName(handle: string, name: string): Promise<boolean> {
  const existing = await getUserProfile(handle);
  if (existing?.name === name) {
    console.log(`[conversation] Name for ${handle} already "${name}", skipping`);
    return false;
  }
  await updateUserProfile(handle, { name });
  console.log(`[conversation] Set name for ${handle}: "${name}"`);
  return true;
}

export async function clearUserProfile(handle: string): Promise<boolean> {
  const deleted = userProfiles.delete(handle);
  if (deleted) console.log(`[conversation] Cleared profile for ${handle}`);
  return deleted;
}
