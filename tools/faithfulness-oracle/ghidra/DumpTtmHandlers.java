// Dump the seg-1058 TTM jump tables, disassemble the handler region, read
// data-segment initial values and scan for references to gating globals.
// Usage: -postScript DumpTtmHandlers.java <outPath>
import ghidra.app.script.GhidraScript;
import ghidra.program.model.address.*;
import ghidra.program.model.listing.*;
import ghidra.program.model.mem.*;
import ghidra.program.model.symbol.*;
import java.io.*;
import java.util.*;

public class DumpTtmHandlers extends GhidraScript {
    PrintWriter w;
    AddressFactory af;

    Address a(String s) { return af.getAddress(s); }

    int rdw(Address ad) throws Exception { return currentProgram.getMemory().getShort(ad) & 0xffff; }
    int rdb(Address ad) throws Exception { return currentProgram.getMemory().getByte(ad) & 0xff; }

    void table(String seg, int base, int n, String label) throws Exception {
        w.println("=== table " + label + " @ " + seg + ":" + Integer.toHexString(base) + " n=" + n);
        for (int i = 0; i < n; i++) {
            int op = rdw(a(seg + ":" + Integer.toHexString(base + i * 2)));
            int h = rdw(a(seg + ":" + Integer.toHexString(base + n * 2 + i * 2)));
            w.println(String.format("  op %04x -> %s:%04x", op, seg, h));
            Address ha = a(seg + ":" + Integer.toHexString(h));
            if (currentProgram.getListing().getInstructionAt(ha) == null) {
                disassemble(ha);
            }
        }
    }

    void listing(String seg, int lo, int hi) throws Exception {
        w.println("=== listing " + seg + ":" + Integer.toHexString(lo) + "-" + Integer.toHexString(hi));
        Address s = a(seg + ":" + Integer.toHexString(lo));
        Address e = a(seg + ":" + Integer.toHexString(hi));
        AddressSet set = new AddressSet(s, e);
        CodeUnitIterator it = currentProgram.getListing().getCodeUnits(set, true);
        while (it.hasNext()) {
            CodeUnit cu = it.next();
            StringBuilder sb = new StringBuilder();
            sb.append(cu.getMinAddress()).append("  ");
            if (cu instanceof Instruction) {
                sb.append(cu.toString());
            } else {
                byte[] b = cu.getBytes();
                sb.append("db ");
                for (byte x : b) sb.append(String.format("%02x ", x & 0xff));
            }
            Reference[] refs = cu.getReferencesFrom();
            for (Reference r : refs) {
                if (r.getReferenceType().isData() || r.getReferenceType().isCall() || r.getReferenceType().isJump()) {
                    sb.append("   ; ->").append(r.getToAddress());
                }
            }
            w.println(sb.toString());
        }
    }

    void dataVal(String name, String addr) throws Exception {
        Address ad = a(addr);
        MemoryBlock blk = currentProgram.getMemory().getBlock(ad);
        String init = (blk != null && blk.isInitialized()) ? "init" : "UNINIT";
        try {
            w.println(String.format("  %s @ %s byte=%02x word=%04x [%s block=%s]", name, addr, rdb(ad), rdw(ad), init, blk == null ? "?" : blk.getName()));
        } catch (Exception ex) {
            w.println("  " + name + " @ " + addr + " unreadable: " + ex);
        }
    }

    // scan code segments for modrm direct-address references to a 1068 offset
    void scanRefs(int off) throws Exception {
        w.println("=== byte-scan for direct refs to 1068:" + Integer.toHexString(off));
        byte lo = (byte) (off & 0xff), hi = (byte) ((off >> 8) & 0xff);
        for (MemoryBlock blk : currentProgram.getMemory().getBlocks()) {
            if (!blk.isInitialized()) continue;
            if (blk.getStart().toString().startsWith("1068")) continue;
            byte[] buf = new byte[(int) blk.getSize()];
            blk.getBytes(blk.getStart(), buf);
            for (int i = 1; i + 1 < buf.length; i++) {
                if (buf[i] == lo && buf[i + 1] == hi) {
                    int modrm = buf[i - 1] & 0xff;
                    boolean direct = (modrm & 0xc7) == 0x06;
                    boolean moffs = modrm >= 0xa0 && modrm <= 0xa3;
                    if (!direct && !moffs) continue;
                    Address at = blk.getStart().add(i - (moffs ? 1 : 2));
                    Instruction ins = currentProgram.getListing().getInstructionContaining(at);
                    String txt;
                    if (ins != null) txt = ins.getMinAddress() + "  " + ins.toString();
                    else {
                        StringBuilder sb = new StringBuilder(at + "  raw:");
                        for (int k = Math.max(0, i - 4); k < Math.min(buf.length, i + 6); k++) sb.append(String.format(" %02x", buf[k] & 0xff));
                        txt = sb.toString();
                    }
                    Function f = currentProgram.getFunctionManager().getFunctionContaining(at);
                    w.println("  " + txt + (f != null ? "   [in " + f.getName() + "]" : "   [no fn]"));
                }
            }
        }
    }

    @Override
    public void run() throws Exception {
        String out = getScriptArgs().length > 0 ? getScriptArgs()[0] : "ttm-handlers.txt";
        af = currentProgram.getAddressFactory();
        w = new PrintWriter(new FileWriter(out));
        w.println("blocks:");
        for (MemoryBlock blk : currentProgram.getMemory().getBlocks())
            w.println("  " + blk.getName() + " " + blk.getStart() + "-" + blk.getEnd() + " init=" + blk.isInitialized());

        table("1058", 0x00fc, 0x12, "Cxxx (FUN_1058_0000)");
        table("1058", 0x03bc, 0x14, "Axxx pre (FUN_1058_0144)");
        table("1058", 0x12bd, 0x2f, "generic ops");
        table("1058", 0x1275, 0x12, "Axxx post (bypass registrar)");
        table("1058", 0x1379, 0x05, "offset-gated (46e4/46e6)");
        table("1058", 0x138d, 0x04, "27c2-gated");
        table("1058", 0x1900, 0x08, "FUN_1058_1510 primitives");

        w.println("=== data values");
        String[][] vals = {
            {"2641", "1068:2641"}, {"2640", "1068:2640"}, {"2642", "1068:2642"},
            {"27c0", "1068:27c0"}, {"27c2", "1068:27c2"}, {"287a", "1068:287a"}, {"287c", "1068:287c"},
            {"4642", "1068:4642"}, {"46da", "1068:46da"}, {"46e0", "1068:46e0"}, {"46e2", "1068:46e2"},
            {"46e4", "1068:46e4"}, {"46e6", "1068:46e6"}, {"1ea3", "1068:1ea3"}, {"1ea2", "1068:1ea2"},
            {"2562", "1068:2562"}, {"2564", "1068:2564"}, {"1eb0", "1068:1eb0"}, {"1eb2", "1068:1eb2"}, {"1eb4", "1068:1eb4"}
        };
        for (String[] v : vals) dataVal(v[0], v[1]);
        w.println("=== pair list @ 1068:287e");
        for (int i = 0; i < 8; i++) {
            Address ad = a("1068:" + Integer.toHexString(0x287e + i * 2));
            try { w.println(String.format("  [%04x] = %04x", 0x287e + i * 2, rdw(ad))); } catch (Exception ex) { w.println("  unreadable " + ad); }
        }

        for (int off : new int[]{0x2641, 0x27c0, 0x27c2, 0x287a, 0x4642, 0x46da, 0x46e4, 0x46e6}) scanRefs(off);

        listing("1058", 0x0000, 0x0144);
        listing("1058", 0x0144, 0x0400);
        listing("1058", 0x0600, 0x1420);
        listing("1058", 0x1510, 0x1a00);
        w.close();
        println("done -> " + out);
    }
}
