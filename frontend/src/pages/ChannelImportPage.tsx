import { useState } from "react";
import { Link } from "react-router-dom";
import { createChannel } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";

interface ImportRow {
  id: string;
  status: 'pending' | 'loading' | 'success' | 'exists' | 'error';
  message?: string;
}

export default function ChannelImportPage() {
  const [inputText, setInputText] = useState("");
  const [rows, setRows] = useState<ImportRow[]>([]);
  const [isImporting, setIsImporting] = useState(false);
  const [isDone, setIsDone] = useState(false);
  const [currentIndex, setCurrentIndex] = useState(0);

  const handleStartImport = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isImporting) return;

    // Parse textarea
    const ids = inputText
      .split('\n')
      .map(line => line.trim())
      .filter(line => line.length > 0);
    
    // Remove duplicates
    const uniqueIds = Array.from(new Set(ids));
    
    if (uniqueIds.length === 0) return;

    const initialRows: ImportRow[] = uniqueIds.map(id => ({
      id,
      status: 'pending'
    }));
    
    setRows(initialRows);
    setIsImporting(true);
    setIsDone(false);
    setCurrentIndex(0);

    for (let i = 0; i < initialRows.length; i++) {
      const row = initialRows[i];
      setCurrentIndex(i + 1);
      
      setRows(prev => prev.map(r => r.id === row.id ? { ...r, status: 'loading' } : r));
      
      try {
        await createChannel({ youtube_channel_id: row.id });
        setRows(prev => prev.map(r => r.id === row.id ? { ...r, status: 'success' } : r));
      } catch (err: any) {
        if (err.response?.status === 409) {
          setRows(prev => prev.map(r => r.id === row.id ? { ...r, status: 'exists' } : r));
        } else {
          setRows(prev => prev.map(r => r.id === row.id ? { ...r, status: 'error', message: err.response?.data?.detail || err.message || "失敗" } : r));
        }
      }
    }
    
    setIsImporting(false);
    setIsDone(true);
  };

  const renderStatusBadge = (status: string, message?: string) => {
    switch (status) {
      case 'pending':
        return <Badge variant="outline">等待中</Badge>;
      case 'loading':
        return <Badge variant="secondary">處理中...</Badge>;
      case 'success':
        return <Badge className="bg-green-600">已新增</Badge>;
      case 'exists':
        return <Badge className="bg-orange-500 hover:bg-orange-600">已存在</Badge>;
      case 'error':
        return <Badge variant="destructive">失敗: {message}</Badge>;
      default:
        return null;
    }
  };

  const successCount = rows.filter(r => r.status === 'success').length;
  const existsCount = rows.filter(r => r.status === 'exists').length;
  const errorCount = rows.filter(r => r.status === 'error').length;

  return (
    <div className="space-y-6 p-6 max-w-4xl mx-auto">
      <div className="flex flex-col gap-2">
        <h1 className="text-3xl font-bold tracking-tight">批次匯入頻道</h1>
        <p className="text-muted-foreground">
          請在下方輸入 YouTube Channel ID，每行一個。系統將會逐一匯入。
        </p>
      </div>

      <form data-testid="channel-import-form" onSubmit={handleStartImport} className="space-y-4">
        <Textarea
          data-testid="channel-ids-input"
          placeholder="每行輸入一個 YouTube Channel ID，例如：&#10;UCxxxxxxxxxxxxxxxxxxxxxx&#10;UCyyyyyyyyyyyyyyyyyyyyyy"
          rows={8}
          value={inputText}
          onChange={(e) => setInputText(e.target.value)}
          disabled={isImporting}
          className="font-mono text-sm"
        />
        
        <div className="flex items-center justify-between">
          <div>
            {isImporting && (
              <span className="text-sm font-medium">處理中：{currentIndex} / {rows.length}</span>
            )}
          </div>
          <Button 
            type="submit" 
            data-testid="import-submit-btn" 
            disabled={isImporting || inputText.trim().length === 0}
          >
            {isImporting ? "匯入中..." : "開始匯入"}
          </Button>
        </div>
      </form>

      {rows.length > 0 && (
        <div className="space-y-4 pt-6 border-t">
          <h2 className="text-xl font-semibold">匯入結果</h2>
          
          <div className="rounded-md border">
            <Table data-testid="import-results">
              <TableHeader>
                <TableRow>
                  <TableHead>YouTube Channel ID</TableHead>
                  <TableHead className="w-[200px]">狀態</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((row) => (
                  <TableRow key={row.id}>
                    <TableCell className="font-medium font-mono">{row.id}</TableCell>
                    <TableCell>{renderStatusBadge(row.status, row.message)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>

          {isDone && (
            <div data-testid="import-summary" className="p-4 bg-muted rounded-lg flex flex-col sm:flex-row items-center justify-between gap-4">
              <div className="font-medium">
                匯入完成：{successCount} 個新增，{existsCount} 個已存在，{errorCount} 個失敗
              </div>
              <Button asChild variant="outline">
                <Link to="/channels">前往頻道列表</Link>
              </Button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
