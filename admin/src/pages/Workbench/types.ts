// 选择的 Shopify 对象
export type ShopifyObjectType = 'products' | 'articles' | 'customers' | 'orders' | 'collections';

export interface ShopifyObject {
  type: ShopifyObjectType;
  ids: string[];
  count: number;
  filters?: Record<string, unknown>;
}

// 文档
export interface Document {
  id: string;
  filename: string;
  type: 'pdf' | 'docx' | 'txt' | 'md' | 'csv' | 'xlsx';
  size: number;
  content?: string;  // 解析的文本内容
  uploadedAt: string;
}

// 多媒体文件
export interface MediaFile {
  id: string;
  filename: string;
  type: 'image' | 'video' | 'audio';
  mimeType: string;
  size: number;
  url?: string;
  transcription?: string;      // 音视频转录
  keyframes?: string[];         // 视频关键帧
  description?: string;         // 内容描述
  uploadedAt: string;
}

// 业务规则
export interface Rule {
  id: string;
  name: string;
  type: 'predefined' | 'custom';
  content: string;
  isSelected?: boolean;
}

// 风格参考
export interface StyleExample {
  id: string;
  filename: string;
  content: string;
  uploadedAt: string;
}

// 约束条件
export interface Constraints {
  maxLength?: number;
  minLength?: number;
  preserveFields?: string[];
  disallowedWords?: string[];
  [key: string]: unknown;
}

// 上下文信息 - 工具栏收集的所有信息
export interface SelectionContext {
  selectedObjects: ShopifyObject | null;
  referenceDocuments: Document[];
  dataSource: Document | null;
  mediaFiles: MediaFile[];
  rules: Rule[];
  styleExamples: StyleExample[];
  constraints: Constraints;
}

// 对话消息
export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: string;
  attachment?: {
    type: 'object-select' | 'file' | 'media';
    data: unknown;
  };
}

// 任务确认卡片
export interface TaskConfirmationCard {
  taskId: string;
  taskName: string;
  description: string;

  // 基本信息
  operation: {
    type: string;
    skillUsed: string[];
    toolsUsed: string[];
  };

  // 对象信息
  targetObjects: {
    type: ShopifyObjectType;
    count: number;
    ids?: string[];
  };

  // 参数配置
  parameters: Record<string, unknown>;

  // 执行估计
  estimation: {
    estimatedDurationMs: number;
    estimatedTokens: number;
    estimatedSuccessRate: number;
  };

  // 效果预览
  preview?: {
    sampleCount: number;
    samples: Array<{
      objectId: string;
      before: string;
      after: string;
    }>;
  };
}

// 任务
export interface Task {
  id: string;
  name: string;
  status: 'executing' | 'completed' | 'failed' | 'pending';
  progress?: number;  // 0-100
  totalItems?: number;
  currentItem?: number;
  startedAt?: string;
  completedAt?: string;

  // 执行结果
  result?: {
    successCount: number;
    failureCount: number;
    totalProcessed: number;
    details?: Array<{
      objectId: string;
      objectName: string;
      status: 'success' | 'failed';
      output?: string;
      error?: string;
    }>;
  };

  // 其他信息
  createdAt: string;
  executionDetails?: TaskConfirmationCard;
  error?: string;
}

// API 响应
export interface ChatResponse {
  reply: string;
  suggestedTask?: {
    taskName: string;
    description: string;
    operation: {
      type: string;
      skillUsed: string[];
      toolsUsed: string[];
    };
    targetObjects: {
      type: ShopifyObjectType;
      count: number;
    };
    parameters: Record<string, unknown>;
    estimation: {
      estimatedDurationMs: number;
      estimatedTokens: number;
      estimatedSuccessRate: number;
    };
  };
}

export interface ExecutionResponse {
  status: 'executing' | 'completed' | 'failed';
  progress: number;
  currentItem?: number;
  totalItems?: number;
  result?: {
    successCount: number;
    failureCount: number;
    details?: unknown;
  };
}
