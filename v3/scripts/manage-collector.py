"""Manage this project's user-level five-minute collector on macOS."""
from pathlib import Path
import os,plistlib,subprocess,sys
ROOT=Path(__file__).resolve().parents[1]
LABEL='local.bike-pulse.v3.collector'
PLIST=Path.home()/'Library/LaunchAgents'/f'{LABEL}.plist'
DOMAIN=f'gui/{os.getuid()}'
action=sys.argv[1] if len(sys.argv)>1 else 'status'
if action=='start':
 if not (ROOT/'.env').exists():raise SystemExit('Configure v3/.env first')
 node=subprocess.check_output(['which','node'],text=True).strip()
 logdir=ROOT/'logs';logdir.mkdir(exist_ok=True)
 config={'Label':LABEL,'ProgramArguments':[node,str(ROOT/'scripts/collect-once.js')],'WorkingDirectory':str(ROOT),'StartInterval':300,'RunAtLoad':True,'ProcessType':'Background','StandardOutPath':str(logdir/'collector.log'),'StandardErrorPath':str(logdir/'collector-error.log')}
 if PLIST.exists():
  old=plistlib.loads(PLIST.read_bytes())
  if old.get('WorkingDirectory')!=str(ROOT):raise SystemExit('A different project owns this collector label; no changes made')
  subprocess.run(['launchctl','bootout',DOMAIN,str(PLIST)],stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL)
 PLIST.parent.mkdir(parents=True,exist_ok=True);PLIST.write_bytes(plistlib.dumps(config))
 subprocess.run(['launchctl','bootstrap',DOMAIN,str(PLIST)],check=True)
 print('Collector enabled: runs now and every 300 seconds while this user is logged in and Mac is awake.')
elif action=='stop':
 subprocess.run(['launchctl','bootout',DOMAIN,str(PLIST)],check=True)
 if PLIST.exists():PLIST.unlink()
 print('Collector stopped; collected history retained.')
elif action=='status':
 result=subprocess.run(['launchctl','print',f'{DOMAIN}/{LABEL}'],capture_output=True,text=True)
 if result.returncode:print('Collector is not loaded.');sys.exit(1)
 for line in result.stdout.splitlines():
  if any(key in line for key in ['state =','runs =','last exit code =','run interval =']):print(line.strip())
else:raise SystemExit('Usage: python3 scripts/manage-collector.py start|stop|status')
