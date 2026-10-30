import { FcPersistence } from '../../../../../shared/fc-persistence';
import { call } from '../channel.js';
import { memoryStorage } from '../native/memory-storage';
export const fcPersistence = new FcPersistence(call, memoryStorage);

export { fcStorageSelection } from '../native/memory-storage';
