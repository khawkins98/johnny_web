// Dump the 79 scene-catalogue records at 1068:1756 (17 bytes each).
// Usage: -postScript DumpCatalogue.java <outPath>
import ghidra.app.script.GhidraScript;
import ghidra.program.model.address.*;
import java.io.*;

public class DumpCatalogue extends GhidraScript {
    @Override
    public void run() throws Exception {
        String out = getScriptArgs().length > 0 ? getScriptArgs()[0] : "catalogue.txt";
        AddressFactory af = currentProgram.getAddressFactory();
        try (PrintWriter w = new PrintWriter(new FileWriter(out))) {
            w.println("idx off ads tag b0 b1 b2 spot b4 b5 b6 b7 b8 b9 b10 wordB wordD");
            for (int i = 0; i < 79; i++) {
                int off = 0x1756 + i * 0x11;
                Address a = af.getAddress("1068:" + Integer.toHexString(off));
                StringBuilder sb = new StringBuilder();
                int[] b = new int[17];
                for (int k = 0; k < 17; k++) b[k] = currentProgram.getMemory().getByte(a.add(k)) & 0xff;
                int wb = b[0xb] | (b[0xc] << 8);
                int wd = b[0xd] | (b[0xe] << 8);
                sb.append(String.format("%2d %04x ads=%02x tag=%2d |", i, off, b[0xf], b[0x10]));
                for (int k = 0; k < 11; k++) sb.append(String.format(" %02x", b[k]));
                sb.append(String.format(" | +b=%04x +d=%04x", wb, wd));
                w.println(sb.toString());
            }
        }
        println("done");
    }
}
