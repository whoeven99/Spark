import { useState, useEffect } from 'react';
import { Layout, Drawer } from 'antd';
import ChatPanel from './components/ChatPanel';
import TaskConfirmationCard from './components/TaskConfirmationCard';
import RightPanel from './components/RightPanel';
import ToolBar from './components/ToolBar';
import type { SelectionContext, ChatMessage, Task } from './types';

const { Content } = Layout;

/**
 * AI 工作台 - 一系列工具和流程的总和，帮助商家实现商店运营操作
 *
 * 布局结构：
 * ┌──────────────────────────────┬─────────┐
 * │ ChatPanel (对话)             │ Task    │
 * │ TaskConfirmationCard (卡片)  │ List    │
 * │ ┌──────────────────────────┐ │ Panel   │
 * │ │ ToolBar (工具栏)         │ │         │
 * │ │ 输入框 [发送]            │ │         │
 * │ └──────────────────────────┘ │         │
 * └──────────────────────────────┴─────────┘
 */
export default function ChatWorkbench() {
  // 上下文信息（来自 ToolBar）
  const [selectionContext, setSelectionContext] = useState<SelectionContext>({
    selectedObjects: null,
    referenceDocuments: [],
    dataSource: null,
    mediaFiles: [],
    rules: [],
    styleExamples: [],
    constraints: {},
  });

  // 对话消息
  const [messages, setMessages] = useState<ChatMessage[]>([]);

  // 任务确认卡片（任务详情页 - 创建前的表单摘要）
  const [confirmationCard, setConfirmationCard] = useState<any | null>(null);

  // 当前编辑的任务卡片ID（用于追踪状态同步）
  const [confirmationCardTaskId, setConfirmationCardTaskId] = useState<string | null>(null);

  // 任务列表
  const [tasks, setTasks] = useState<Task[]>([]);
  const [taskDrawerOpen, setTaskDrawerOpen] = useState(false);
  const [selectedTaskForDetail, setSelectedTaskForDetail] = useState<Task | null>(null);

  // 可用技能和工具
  const [availableSkills, setAvailableSkills] = useState<Array<{ name: string; category: string; description: string }>>([]);
  const [availableTools, setAvailableTools] = useState<Array<{ name: string; description: string }>>([]);

  // 获取可用技能和工具
  useEffect(() => {
    const fetchCapabilities = async () => {
      try {
        const response = await fetch('/api/workbench/capabilities');
        const data = await response.json();
        setAvailableSkills(data.skills || []);
        setAvailableTools(data.tools || []);
      } catch (error) {
        console.error('Error fetching capabilities:', error);
        // 使用默认数据
        setAvailableSkills([
          { name: '商品描述优化', category: '内容优化', description: '使用 AI 优化商品描述，改进 SEO 和转化率' },
          { name: '标题生成', category: '内容生成', description: '为商品生成吸引人的标题' },
          { name: '图片生成', category: '视觉设计', description: '生成或优化商品图片' },
        ]);
        setAvailableTools([
          { name: '文本分析', description: '分析文本内容的情感、关键词等信息' },
          { name: 'SEO 检查', description: '检查内容的 SEO 友好度' },
          { name: '翻译工具', description: '多语言翻译支持' },
        ]);
      }
    };
    fetchCapabilities();
  }, []);

  const handleSendMessage = async (message: string) => {
    // 添加用户消息
    const userMessage: ChatMessage = {
      id: `msg-${Date.now()}`,
      role: 'user',
      content: message,
      timestamp: new Date().toISOString(),
    };
    setMessages([...messages, userMessage]);

    // 调用后端 API 获取 AI 回复和任务建议
    try {
      const response = await fetch('/api/workbench/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message,
          context: selectionContext,
        }),
      });

      const data = await response.json();

      // 添加 AI 回复
      const assistantMessage: ChatMessage = {
        id: `msg-${Date.now() + 1}`,
        role: 'assistant',
        content: data.reply,
        timestamp: new Date().toISOString(),
      };
      setMessages((prev) => [...prev, assistantMessage]);

      // 如果有任务建议，显示任务确认卡片
      if (data.suggestedTask) {
        const taskId = `task-${Date.now()}`;
        setConfirmationCard({
          ...data.suggestedTask,
          taskId,
          status: 'draft', // 未执行状态
        });
        setConfirmationCardTaskId(taskId);
      }
    } catch (error) {
      console.error('Error sending message:', error);
    }
  };

  const handleExecuteTask = async (taskCard: any) => {
    // 创建真实任务（从确认卡片启动）
    const newTask: Task = {
      id: taskCard.taskId,
      name: taskCard.taskName,
      status: 'executing',
      progress: 0,
      totalItems: taskCard.targetObjects?.count || 0,
      currentItem: 0,
      createdAt: new Date().toISOString(),
      executionDetails: taskCard,
    };

    // 添加到任务列表
    setTasks([newTask, ...tasks]);

    // 关闭确认卡片
    setConfirmationCard(null);
    setConfirmationCardTaskId(null);

    // 在对话中添加状态提示
    const statusMessage: ChatMessage = {
      id: `msg-${Date.now()}`,
      role: 'assistant',
      content: `✅ 任务已启动：${taskCard.taskName}`,
      timestamp: new Date().toISOString(),
    };
    setMessages((prev) => [...prev, statusMessage]);

    // 轮询获取任务进度
    const pollProgress = async () => {
      try {
        const response = await fetch(`/api/workbench/execution/${newTask.id}`);
        const data = await response.json();

        setTasks((prevTasks) =>
          prevTasks.map((t) =>
            t.id === newTask.id
              ? {
                  ...t,
                  status: data.status,
                  progress: data.progress,
                  currentItem: data.currentItem,
                  result: data.result,
                }
              : t
          )
        );

        // 同时更新对话中的确认卡片状态（如果还在展示）
        if (confirmationCardTaskId === newTask.id) {
          setConfirmationCard((prev) =>
            prev
              ? {
                  ...prev,
                  status: data.status,
                  progress: data.progress,
                }
              : null
          );
        }

        // 如果还在执行，继续轮询
        if (data.status === 'executing') {
          setTimeout(pollProgress, 1000);
        }
      } catch (error) {
        console.error('Error polling task progress:', error);
      }
    };

    pollProgress();
  };

  return (
    <Layout style={{ minHeight: '100vh' }}>
      <Content style={{ display: 'flex', gap: '16px', padding: '16px' }}>
        {/* 中央：对话区 + 任务确认卡片 + 工具栏 */}
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '16px' }}>
          {/* 对话面板 */}
          <ChatPanel
            messages={messages}
            onSendMessage={handleSendMessage}
            selectedContext={selectionContext}
          />

          {/* 任务确认卡片（任务详情页 - 创建前的表单摘要） */}
          {confirmationCard && (
            <TaskConfirmationCard
              card={confirmationCard}
              onExecute={handleExecuteTask}
              onCancel={() => {
                setConfirmationCard(null);
                setConfirmationCardTaskId(null);
              }}
              onEditParameters={(edited) => {
                setConfirmationCard({ ...confirmationCard, ...edited });
              }}
            />
          )}

          {/* ToolBar - 对话框下方的工具栏（类似 Claude） */}
          <ToolBar
            value={selectionContext}
            onChange={setSelectionContext}
          />
        </div>

        {/* 右侧：综合面板（任务、技能、工具、对话记录） */}
        <RightPanel
          tasks={tasks}
          messages={messages}
          availableSkills={availableSkills}
          availableTools={availableTools}
          onTaskClick={(task) => {
            setSelectedTaskForDetail(task);
            setTaskDrawerOpen(true);
          }}
        />
      </Content>

      {/* 任务详情抽屉 */}
      <Drawer
        title="任务详情"
        placement="right"
        onClose={() => setTaskDrawerOpen(false)}
        open={taskDrawerOpen}
        width={500}
      >
        {selectedTaskForDetail && (
          <div>
            <h3>{selectedTaskForDetail.name}</h3>
            <p>状态: {selectedTaskForDetail.status}</p>
            <p>进度: {selectedTaskForDetail.progress}%</p>
            {/* 详情内容后续完善 */}
          </div>
        )}
      </Drawer>
    </Layout>
  );
}
