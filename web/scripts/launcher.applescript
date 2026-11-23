-- 布袋戲特效（puppet-vfx）啟動器：伺服器沒開就先開，再用瀏覽器打開主畫面
property webDir : "/Users/linkliu/puppet-vfx/web"
property port : "5173"
property altPort : "5199"
property dryRun : false

on isOurs(p)
	set r to do shell script "curl -s --max-time 2 http://localhost:" & p & "/ | grep -c 'puppet-vfx' || true"
	return r is not "0" and r is not ""
end isOurs

on portBusy(p)
	return (do shell script "lsof -nP -iTCP:" & p & " -sTCP:LISTEN >/dev/null 2>&1 && echo yes || echo no") is "yes"
end portBusy

set usePort to port
if not isOurs(port) then
	if portBusy(port) then set usePort to altPort -- 5173 被別的程式佔用，改用備用埠
	if not isOurs(usePort) then
		do shell script "cd " & quoted form of webDir & "; export PATH=/opt/homebrew/bin:$PATH; nohup npx vite --port " & usePort & " --strictPort > " & quoted form of (webDir & "/.dev-server.log") & " 2>&1 < /dev/null &"
		set ok to false
		repeat 60 times
			delay 0.5
			if isOurs(usePort) then
				set ok to true
				exit repeat
			end if
		end repeat
		if not ok then
			display dialog "伺服器 30 秒內沒有啟動，請看 " & webDir & "/.dev-server.log" buttons {"好"} default button 1 with icon caution
			return
		end if
	end if
end if
if dryRun then
	return "OPEN http://localhost:" & usePort & "/"
end if
open location "http://localhost:" & usePort & "/"
