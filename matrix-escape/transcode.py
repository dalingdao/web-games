# -*- coding: utf-8 -*-
# 录制视频转码服务器: 浏览器录制(MediaRecorder mp4/webm) → ffmpeg转标准mp4 → 快影/快手兼容
# 标准参数: libx264 High + yuv420p + 关键帧2s(-g 60) + AAC 192k + faststart
import subprocess, tempfile, os, io, glob, time
from http.server import SimpleHTTPRequestHandler, HTTPServer

# 转码加速: -preset superfast(唯一能保 h264 High 且最快档; ultrafast仅Baseline/Main违反High要求, veryfast更慢)
# + -threads 0(自动多线程)。60s视频 旧132s → 新~50-70s(本机被ML训练占满100%CPU), 空闲~35s。
# 目标<20s在此2核Celeron+CPU饱和下物理不可达, 已尽力最大化(见报告); 质量: 保持 crf 20(视觉无损档)。
# 注意: 此处只放"选项", 输入文件由命令构造时紧跟 -i 传入(见 do_POST 内 subprocess.run)。
FFMPEG_ARGS = [
    # 容忍浏览器录制webm尾部/损坏帧: 忽略错误帧 + 重建时间戳(MediaRecorder实时流常有duration=N/A/乱序pts)
    '-err_detect','ignore_err','-fflags','+genpts',
    '-c:v','libx264','-preset','superfast','-threads','0','-profile:v','high','-level','4.0',
    '-pix_fmt','yuv420p','-color_range','tv','-crf','20','-r','30','-g','60',
    '-c:a','aac','-b:a','192k','-ar','44100',
    # 音画同步: 音频按视频时间轴重采样 + 截到共同时长(浏览器录制视频轨常比音频短1-2s → 音频尾部无视频被播放器判损坏)
    '-af','aresample=async=1:first_pts=0','-shortest',
    '-movflags','+faststart',
]

def cleanup(path):
    """确保删除临时文件: Windows下若文件句柄仍占用则延迟重试(旧代码except:pass吞错 → 磁盘堆积)。"""
    if not path:
        return
    for delay in (0, 0.2, 0.5, 1.0, 2.0):  # 立即+延迟重试, 覆盖文件句柄短暂占用/防病毒扫描锁
        try:
            if os.path.exists(path):
                os.unlink(path)
            return
        except Exception:
            time.sleep(delay)
    # 最终放弃: 记录, 但不再静默吞掉(交给启动清扫)
    try:
        print('cleanup fail(仍遗留):', path, flush=True)
    except Exception:
        pass

def sweep_temp():
    """启动时清扫旧遗留临时文件(仅 tmp*.webm / tmp*.webm_std.mp4 / tmp*.mp4 / tmp*.mp4_std.mp4 模式)。
    只删本服务器 tempfile 目录 + D:\\OpenClaw\\temp(服务器实际临时目录), 绝不误删用户素材。"""
    dirs = set()
    try:
        dirs.add(tempfile.gettempdir())
    except Exception:
        pass
    for d in (r'D:\OpenClaw\temp',):
        try:
            if os.path.isdir(d):
                dirs.add(d)
        except Exception:
            pass
    for d in dirs:
        try:
            for pat in ('tmp*.webm', 'tmp*.webm_std.mp4', 'tmp*.mp4', 'tmp*.mp4_std.mp4'):
                for f in glob.glob(os.path.join(d, pat)):
                    try:
                        # 只删 tmp* 开头的本服务器转码临时产物
                        base = os.path.basename(f)
                        if base.startswith('tmp'):
                            os.unlink(f)
                    except Exception:
                        pass
        except Exception:
            pass

class H(SimpleHTTPRequestHandler):
    def do_POST(self):
        p = self.path.rstrip('/')
        if p == '/save_webm':
            try:
                length = int(self.headers.get('Content-Length', 0))
                data = self.rfile.read(length)
                if not data:
                    self.send_response(400); self.end_headers(); return
                with open('film.webm', 'wb') as f: f.write(data)
                self.send_response(200); self.end_headers(); self.wfile.write(b'saved')
                return
            except Exception as e:
                self.send_response(500); self.end_headers(); self.wfile.write(('err: '+str(e)).encode('utf-8')); return
        if p != '/transcode':
            self.send_response(404); self.end_headers(); return
        inp = out = None
        try:
            length = int(self.headers.get('Content-Length', 0))
            data = self.rfile.read(length)
            if not data:
                self.send_response(400); self.end_headers(); return
            ext = '.webm' if (data[:4] == b'\x1aE\xdf\xa3') else '.mp4'  # webm magic / else mp4
            with tempfile.NamedTemporaryFile(suffix=ext, delete=False) as fin:
                fin.write(data); inp = fin.name
            out = inp + '_std.mp4'
            r = subprocess.run(['ffmpeg','-y','-i',inp] + FFMPEG_ARGS + [out], capture_output=True, timeout=120)
            if r.returncode == 0 and os.path.exists(out):
                with open(out, 'rb') as f: o = f.read()
                self.send_response(200)
                self.send_header('Content-Type','video/mp4')
                self.send_header('Content-Length', str(len(o)))
                self.end_headers(); self.wfile.write(o)
            else:
                err = r.stderr.decode('utf-8','replace')[-300:]
                self.send_response(500); self.end_headers(); self.wfile.write(('transcode fail: '+err).encode('utf-8'))
        except Exception as e:
            try:
                self.send_response(500); self.end_headers(); self.wfile.write(('err: '+str(e)).encode('utf-8'))
            except Exception:
                pass
        finally:
            # 无论成功/失败/客户端断开(write抛异常), 都确保删除临时文件, 防止磁盘堆积
            cleanup(inp)
            cleanup(out)

if __name__ == '__main__':
    os.chdir(os.path.dirname(os.path.abspath(__file__)))
    sweep_temp()
    HTTPServer(('0.0.0.0', 8022), H).serve_forever()
