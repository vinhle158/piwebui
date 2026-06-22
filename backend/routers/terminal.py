import asyncio
import os
import logging
from fastapi import APIRouter, WebSocket, WebSocketDisconnect

logger = logging.getLogger(__name__)
router = APIRouter()

try:
    import pty
    import fcntl
    import termios
    import struct
except ImportError:
    pty = None
    fcntl = None
    termios = None
    struct = None

def set_pty_size(fd: int, rows: int, cols: int):
    """Set the window size of the pseudo-terminal using ioctl."""
    if fcntl and termios and struct:
        try:
            # TIOCSWINSZ is 0x5414 on Linux
            size = struct.pack("HHHH", rows, cols, 0, 0)
            fcntl.ioctl(fd, termios.TIOCSWINSZ, size)
        except Exception as e:
            logger.error(f"Error setting terminal PTY size: {e}")

@router.websocket("/terminal")
async def terminal_ws(ws: WebSocket):
    await ws.accept()
    
    if pty is None:
        # Graceful fallback for Windows/Non-PTY environments
        banner = (
            "\r\n\x1b[1;33m[Pi WebUI Terminal] Windows/Non-PTY environment detected.\x1b[0m\r\n"
            "\x1b[1;36m[Pi WebUI Terminal] Interactive PTY terminal is only supported on Linux (Raspberry Pi).\x1b[0m\r\n"
            "\x1b[1;32m[Pi WebUI Terminal] Echo Mode enabled for testing. Type anything to see it echoed:\x1b[0m\r\n\r\n"
            "piwebui-mock> "
        )
        await ws.send_text(banner)
        
        # Buffer to keep track of current typed line
        current_line = []
        try:
            while True:
                msg = await ws.receive()
                if "bytes" in msg:
                    data = msg["bytes"]
                    try:
                        text = data.decode("utf-8", errors="replace")
                    except Exception:
                        text = ""
                    
                    for char in text:
                        if char == "\r" or char == "\n":
                            line_str = "".join(current_line).strip()
                            current_line = []
                            # Implement a couple of basic mock commands
                            if line_str == "help":
                                await ws.send_text("\r\nAvailable mock commands: help, hello, clear, uname")
                            elif line_str == "hello":
                                await ws.send_text("\r\nHello from Pi WebUI mock terminal!")
                            elif line_str == "uname":
                                await ws.send_text("\r\nWindows_NT (Mock Environment)")
                            elif line_str == "clear":
                                await ws.send_text("\x1b[2J\x1b[H") # ANSI clear screen & home cursor
                            elif line_str:
                                await ws.send_text(f"\r\ncommand not found: {line_str}")
                            
                            await ws.send_text("\r\npiwebui-mock> ")
                        elif char == "\x7f" or char == "\x08":  # Backspace/Del
                            if current_line:
                                current_line.pop()
                                await ws.send_text("\b \b") # Backspace, space, backspace to erase in terminal
                        elif char.isprintable() or char == " ":
                            current_line.append(char)
                            await ws.send_bytes(char.encode("utf-8"))
                elif "text" in msg:
                    # Ignore or parse text commands
                    pass
        except WebSocketDisconnect:
            pass
        return

    # Linux / PTY implementation
    master_fd, slave_fd = pty.openpty()
    pid = os.fork()
    if pid == 0:
        # Child process: configure terminal session and execute shell
        os.setsid()
        for fd in (0, 1, 2):
            os.dup2(slave_fd, fd)
        os.close(master_fd)
        
        # Launch login shell
        try:
            os.execvp("bash", ["bash", "--login"])
        except Exception:
            # Fallback to standard sh if bash isn't available
            os.execvp("sh", ["sh"])
    else:
        # Parent process: relay data between WebSocket and pseudo-terminal
        os.close(slave_fd)
        loop = asyncio.get_event_loop()
        
        read_task = None
        write_task = None
        
        async def read_pty():
            try:
                while True:
                    data = await loop.run_in_executor(None, os.read, master_fd, 4096)
                    if not data:
                        break
                    await ws.send_bytes(data)
            except Exception:
                pass

        async def write_pty():
            try:
                while True:
                    msg = await ws.receive()
                    if "bytes" in msg:
                        os.write(master_fd, msg["bytes"])
                    elif "text" in msg:
                        # Handle JSON commands like resize
                        try:
                            import json
                            data = json.loads(msg["text"])
                            if data.get("type") == "resize":
                                cols = data.get("cols")
                                rows = data.get("rows")
                                if isinstance(cols, int) and isinstance(rows, int):
                                    set_pty_size(master_fd, rows, cols)
                        except Exception as e:
                            logger.error(f"Failed to handle terminal resize message: {e}")
            except Exception:
                pass

        try:
            read_task = asyncio.create_task(read_pty())
            write_task = asyncio.create_task(write_pty())
            await asyncio.gather(read_task, write_task)
        except (WebSocketDisconnect, OSError):
            pass
        finally:
            if read_task:
                read_task.cancel()
            if write_task:
                write_task.cancel()
            
            try:
                os.close(master_fd)
            except Exception:
                pass
            try:
                os.kill(pid, 9)
                os.waitpid(pid, 0)
            except Exception:
                pass
