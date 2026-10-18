// Only the icons the app uses are bundled (tree-shaking), as in WE Budget.
// Adding an icon: import it here and list it in usedIcons.
import {
  Banknote, BookOpen, Boxes, Building2, Calculator, ChartColumn, Ellipsis, FilePlus2, FileText, FileMinus,
  FileCheck, Files, Inbox, Landmark, LayoutDashboard, Mail, MailCheck, NotebookPen, Plus, Receipt, Repeat,
  ScanLine, Send, Settings, ShoppingCart, Truck, Users, Wallet, X, BellRing, ClipboardList, FileSpreadsheet,
  Archive, Lock, Construction
} from 'lucide';
import { createIcons } from 'lucide';

export const usedIcons = {
  Banknote, BookOpen, Boxes, Building2, Calculator, ChartColumn, Ellipsis, FilePlus2, FileText, FileMinus,
  FileCheck, Files, Inbox, Landmark, LayoutDashboard, Mail, MailCheck, NotebookPen, Plus, Receipt, Repeat,
  ScanLine, Send, Settings, ShoppingCart, Truck, Users, Wallet, X, BellRing, ClipboardList, FileSpreadsheet,
  Archive, Lock, Construction
};

export function refreshIcons(root = document) {
  createIcons({ icons: usedIcons, root });
}
