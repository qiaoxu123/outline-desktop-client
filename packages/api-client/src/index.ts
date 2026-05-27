export { apiRequest, type TransportConfig } from "./transport";
export {
  listCollections,
  getCollection,
  getCollectionDocuments,
  listDocuments,
  getDocument,
  searchDocuments,
  createDocument,
  updateDocument,
  deleteDocument,
  listAttachments,
  createAttachment,
} from "./methods";
export {
  OutlineApiError,
  AuthError,
  NetworkError,
  ValidationError,
  classifyError,
} from "./errors";
