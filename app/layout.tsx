import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "标智 BidAI · 政企项目智能申报助手",
  description: "用于政企项目申报材料管理、章节生成、保存与 Word 导出的本地演示应用。",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return <html lang="zh-CN"><body>{children}</body></html>;
}
