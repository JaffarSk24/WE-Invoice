// Only the icons the app uses are bundled (tree-shaking), as in WE Budget.
// Adding an icon: import it here and list it in usedIcons.
import {
  AlarmClock, Archive, ArrowDown, ArrowLeft, ArrowRight, ArrowUp, Ban, Banknote, Bell, BellRing, BookCheck, BookOpen,
  Bookmark, Boxes, Building2, Calculator, ChartColumn, Check, ChevronDown, ChevronLeft, ChevronRight, Circle, CircleCheck,
  CircleDot, CircleHelp, CirclePlus, CircleX, ClipboardList, Cloud, CloudAlert, CloudCheck, CloudOff, Columns3,
  Construction, Download, Ellipsis, ExternalLink, FileCheck, FileMinus, FilePlus2, FileSpreadsheet, FileText, Files, Code, Globe, HardDrive,
  Hourglass, Import, Inbox, Info, KeyRound, Keyboard, Landmark, LayoutDashboard, LayoutGrid, Lock, LogIn, Mail, MailCheck,
  NotebookPen, Palette, PartyPopper, PencilLine, Plug, Plus, Receipt, RefreshCw, Repeat, RotateCcw, ScanLine, Search, Send, Settings,
  ShieldCheck, ShoppingCart, Smartphone, Sparkles, SquareX, ThumbsUp, TriangleAlert, Truck, Users, Wallet, X
} from 'lucide';
import { createIcons } from 'lucide';

export const usedIcons = {
  AlarmClock, Archive, ArrowDown, ArrowLeft, ArrowRight, ArrowUp, Ban, Banknote, Bell, BellRing, BookCheck, BookOpen,
  Bookmark, Boxes, Building2, Calculator, ChartColumn, Check, ChevronDown, ChevronLeft, ChevronRight, Circle, CircleCheck,
  CircleDot, CircleHelp, CirclePlus, CircleX, ClipboardList, Cloud, CloudAlert, CloudCheck, CloudOff, Columns3,
  Construction, Download, Ellipsis, ExternalLink, FileCheck, FileMinus, FilePlus2, FileSpreadsheet, FileText, Files, Code, Globe, HardDrive,
  Hourglass, Import, Inbox, Info, KeyRound, Keyboard, Landmark, LayoutDashboard, LayoutGrid, Lock, LogIn, Mail, MailCheck,
  NotebookPen, Palette, PartyPopper, PencilLine, Plug, Plus, Receipt, RefreshCw, Repeat, RotateCcw, ScanLine, Search, Send, Settings,
  ShieldCheck, ShoppingCart, Smartphone, Sparkles, SquareX, ThumbsUp, TriangleAlert, Truck, Users, Wallet, X
};

export function refreshIcons(root = document) {
  createIcons({ icons: usedIcons, root });
}
