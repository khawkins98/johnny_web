// Read a few data-segment initial values and strings.
// Usage: -postScript DumpDataVals.java <outPath>
import ghidra.app.script.GhidraScript;
import ghidra.program.model.address.*;
import java.io.*;

public class DumpDataVals extends GhidraScript {
    @Override
    public void run() throws Exception {
        String out = getScriptArgs().length > 0 ? getScriptArgs()[0] : "datavals.txt";
        AddressFactory af = currentProgram.getAddressFactory();
        try (PrintWriter w = new PrintWriter(new FileWriter(out))) {
            for (String off : new String[]{"00b6", "00b8", "00ba", "00bc", "1ebd", "1ebf", "2640", "30b4", "30ba", "30c4", "30c6", "42a0", "2e76", "2e77", "2e78", "2e79"}) {
                Address a = af.getAddress("1068:" + off);
                w.println(String.format("%s word=%04x byte=%02x", off, currentProgram.getMemory().getShort(a) & 0xffff, currentProgram.getMemory().getByte(a) & 0xff));
            }
            for (String off : new String[]{"0090", "00a9", "00e5", "00ec", "00f3", "00fa", "0262", "02d3"}) {
                Address a = af.getAddress("1068:" + off);
                StringBuilder sb = new StringBuilder();
                for (int i = 0; i < 24; i++) {
                    int b = currentProgram.getMemory().getByte(a.add(i)) & 0xff;
                    if (b == 0) break;
                    sb.append(b >= 32 && b < 127 ? (char) b : '.');
                }
                w.println("str " + off + " = \"" + sb + "\"");
            }
        }
        println("done");
    }
}
