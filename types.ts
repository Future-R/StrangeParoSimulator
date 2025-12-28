
// 核心数据结构定义

export type AttributeKey = '体质' | '学识' | '魅力' | '财富' | '心情' | '体力' | '精力' | '爱欲';
export type RaceAttributeKey = '速度' | '耐力' | '力量' | '毅力' | '智慧';

export interface Attributes {
  // 基础素质 (Stable, Hard to change, 0-100, avg 20)
  体质: number;
  学识: number;
  魅力: number;
  财富: number;
  
  // 生存状态 (Volatile, Frequent change, 0-100)
  心情: number; // Sanity / Mood
  体力: number; // Stamina / HP
  精力: number; // Mental Energy / AP
  爱欲: number; // Libido / Desire
}

export interface RaceAttributes {
  速度: number;
  耐力: number;
  力量: number;
  毅力: number;
  智慧: number;
}

// 适性结构 (S, A, B, C, D, E, F, G)
export interface Aptitudes {
  草地: string;
  沙地: string;
  短距离: string;
  英里: string;
  中距离: string;
  长距离: string;
  领头: string;
  前列: string;
  居中: string;
  后追: string;
}

// 关系结构 (0-100)
export interface Relationship {
  友情: number;
  爱情: number;
}

// 标签模板
export interface TagTemplate {
  id: string;
  显示名: string;
  描述: string;
  稀有度: number;
  互斥标签: string[];
  人类可用: boolean;
  马娘可用: boolean;
  开局可选: boolean;
}

// 运行时标签
export interface RuntimeTag {
  templateId: string;
  添加日期: number; 
  层数: number; 
}

// 称呼规则
export interface CallingRule {
  判别式?: string; // 如果为空，则默认匹配
  称呼: string;
}

// 角色模板
export interface CharacterTemplate {
  id: string;
  名称: string;
  性别: '男' | '女';
  初始标签: string[];
  通用属性: Attributes;
  竞赛属性: RaceAttributes;
  适性?: Aptitudes; // 新增：适性配置
  isTrainer: boolean;
  称呼列表?: CallingRule[]; // 新增：自定义对训练员的称呼逻辑
}

// 运行时角色
export interface RuntimeCharacter {
  instanceId: string;
  templateId: string;
  名称: string;
  性别: '男' | '女';
  通用属性: Attributes;
  竞赛属性: RaceAttributes;
  适性?: Aptitudes; // 新增
  标签组: RuntimeTag[];
  已触发事件: Record<string, number>;
  关系列表: Record<string, Relationship>; // Key: Target Instance ID (usually 'p1')
  称呼列表?: CallingRule[]; // 运行时也保留配置
  inTeam: boolean; // 新增：是否在队伍中（决定是否显示和行动）
}

// 选项对象
export interface EventOption {
  显示文本: string;
  操作指令: string; 
}

// 扩展分支对象：支持逻辑判别后执行指令
export interface EventBranch {
  注释?: string;
  判别式: string; // 如 "已选序号 == 1 && 随机(1~100) > 50"
  操作指令: string; // 满足后执行的 DSL
  跳转事件ID?: string; // 可选的强制后续跳转
}

// 事件配置
export interface GameEvent {
  id: string;
  注释?: string;
  权重: number;
  可触发次数: number;
  标签组?: string[];
  触发条件: string; 
  预操作指令?: string; // New: 触发前立即执行的指令
  标题?: string;
  正文: string; 
  操作指令?: string; 
  选项组?: EventOption[];
  分支组?: EventBranch[]; // 新增：逻辑分支
}

// 日志条目
export interface LogEntry {
  turn: number;
  characterName: string;
  text: string;
  type: 'event' | 'system' | 'choice';
  isImportant?: boolean;
}

// 待处理事件项
export interface PendingEventItem {
  characterId: string;
  event: GameEvent;
  variables?: Record<string, any>; // New: 临时变量存储 (Key -> Value/InstanceID)
}

// 全局游戏状态
export interface GameState {
  gamePhase: 'setup' | 'playing' | 'gameover';
  currentTurn: number;
  maxTurns: number;
  characters: RuntimeCharacter[];
  logs: LogEntry[];
  pendingEvents: PendingEventItem[]; 
  currentTurnQueue: string[]; // 新增：本回合待结算的角色实例ID队列
  isAuto: boolean;
  autoSpeed: number;
}
