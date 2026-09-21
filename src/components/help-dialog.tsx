import React from 'react';
import { AppDialog } from './app-dialog';
import { useI18n } from './use-i18n';
import './help-dialog.css';

type HelpDialogProps = {
    open: boolean;
    onClose(): void;
};

export const HelpDialog = ({ open, onClose }: HelpDialogProps) => {
    const { t, language } = useI18n();
    const zh = language === 'zh-CN';

    return (
        <AppDialog open={open} onClose={onClose} title={t('Help & Support')} size="large">
            <div className="help-dialog">
                <section>
                    <h3>{t('Getting started')}</h3>
                    <ol>
                        <li>{t('Connect your recorder and choose the matching connection method.')}</li>
                        <li>{t('Import local audio, then review titles, order, groups and recording modes.')}</li>
                        <li>{t('Review the capacity estimate before starting the write task.')}</li>
                        <li>{t('Follow progress and saved files in the task center.')}</li>
                    </ol>
                </section>

                <section>
                    <h3>{zh ? '用 AI 接管制作（MCP）' : 'Make an MD with AI (MCP)'}</h3>
                    <ol>
                        <li>{zh ? '保持此页面打开，在页面中连接碟机。在设置的“AI 接入（MCP）”中打开“允许 AI 协助制作 MD”，保存后重新连接设备。' : 'Keep this page open and connect the recorder. Enable the local bridge in Settings, save, then reconnect.'}</li>
                        <li>{zh ? '在支持本地 STDIO MCP 的 AI 客户端中添加下方配置，把 C:/MD-Studio 替换为本项目所在文件夹。需要本机已安装 Node.js 并完成 npm install。' : 'Add the configuration below to an AI client supporting local STDIO MCP. Replace C:/MD-Studio with this project folder. Install Node.js and run npm install first.'}</li>
                    </ol>
                    <pre>{JSON.stringify({ mcpServers: { 'md-studio': { command: 'cmd.exe', args: ['/c', 'npm', '--prefix', 'C:/MD-Studio', 'run', 'mcp'] } } }, null, 2)}</pre>
                    <p>{zh ? '连接类型：STDIO。客户端负责启动 MCP 进程；不要同时手动启动第二份。它通过本机 127.0.0.1:47123 与页面通信。仅支持远程 URL 的 MCP 客户端不能直接使用此配置。' : 'Transport: STDIO. Let the client launch one MCP process. It connects to this page at 127.0.0.1:47123. Clients supporting only remote MCP URLs cannot use this configuration directly.'}</p>
                    <p>{zh ? '连接成功后，让 AI 调用 minidisc_get_workspace 检查设备。提供音频的本地路径、曲序、标题、分组和 SP / LP2 / LP4 要求。AI 应先导入并预览容量，按你的录制授权写入，再查询任务直到实际完成。' : 'Ask AI to call minidisc_get_workspace to check the device. Supply local audio paths, order, titles, groups and SP / LP2 / LP4. AI should stage files, preview capacity, write with your authorization, and check the task until completion.'}</p>
                    <blockquote>{zh ? '把 C:/Music/Album 里的音频按曲序整理，使用 LP2，碟名设为 Album。先给我确认曲目、分组和容量，再开始写盘。' : 'Prepare the audio in C:/Music/Album in track order, use LP2 and name the disc Album. Show me the tracks, groups and capacity before writing.'}</blockquote>
                    <p>{zh ? '找不到设备：先在页面连接 USB。连接失败：检查桥接开关、MCP 进程和 47123 端口是否被另一份程序占用。音频读取与转码在本机完成；AI 客户端自身如何处理提示和曲目信息取决于该客户端。' : 'No device: connect USB in this page first. Bridge failure: check the switch, MCP process and port 47123 for a second process. Audio reading and conversion remain local; handling of prompts and track information depends on the AI client.'}</p>
                </section>
                <section>
                    <h3>{zh ? 'MD 文件夹（Group）' : 'MD folders (Groups)'}</h3>
                    <p>{zh ? '碟片曲目上方可新建分组。选择连续且未归组的曲目并命名；点击组名可选中整组，在右侧修改组名。取消分组保留曲目；调整成员时先取消原分组、调整曲序，再重新分组。' : 'Create a group above the disc tracks. Select consecutive ungrouped tracks and name the group. Click a group to select its tracks and rename it in the inspector. Ungroup preserves audio; to change membership, ungroup, reorder, and regroup.'}</p>
                </section>
                <section>
                    <h3>{t('Recording and stopping')}</h3>
                    <p>{t('A track already recording cannot be interrupted safely. End batch stops later tracks from starting, but the current track continues until the recorder finishes it.')}</p>
                    <p>{t('Keep the recorder powered and USB connected while its recording light is flashing.')}</p>
                </section>

                <section>
                    <h3>{t('USB connection troubleshooting')}</h3>
                    <ul>
                        <li>{t('Close other MiniDisc apps and browser tabs that may be using the recorder.')}</li>
                        <li>{t('Reconnect USB, confirm the recorder has power, then try again.')}</li>
                        <li>{t('On Windows, the recorder must use a compatible WinUSB driver.')}</li>
                    </ul>
                </section>

                <section>
                    <h3>{t('Local processing')}</h3>
                    <p>{t('Audio conversion, metadata work, device control and automation run on this computer. The hosted web app only delivers static application files.')}</p>
                </section>
            </div>
        </AppDialog>
    );
};
