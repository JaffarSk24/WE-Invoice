// Validates UBL files against the OASIS UBL 2.1 schemas with the XML
// validator built into the JDK. The Schematron rules do not check element
// order or unknown elements; the schema does. Imports without a schema
// location (the CCTS and signature modules) are found by namespace among
// the .xsd files under the schema directory.
//   java tests/fixtures/ubl/XsdValidate.java <schema-dir> <file>...
import java.io.File;
import java.io.FileInputStream;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.HashMap;
import java.util.Map;
import java.util.regex.Matcher;
import java.util.regex.Pattern;
import java.util.stream.Stream;
import javax.xml.XMLConstants;
import javax.xml.transform.stream.StreamSource;
import javax.xml.validation.Schema;
import javax.xml.validation.SchemaFactory;
import org.w3c.dom.ls.DOMImplementationLS;
import org.w3c.dom.ls.LSInput;
import org.w3c.dom.bootstrap.DOMImplementationRegistry;

public class XsdValidate {
  static final Pattern TARGET = Pattern.compile("targetNamespace=\"([^\"]+)\"");

  public static void main(String[] args) throws Exception {
    Map<String, Path> byNamespace = new HashMap<>();
    Path invoiceXsd = null;
    Path creditNoteXsd = null;
    try (Stream<Path> files = Files.walk(Path.of(args[0]))) {
      for (Path p : (Iterable<Path>) files.filter(f -> f.toString().endsWith(".xsd"))::iterator) {
        String name = p.getFileName().toString();
        if (name.equals("UBL-Invoice-2.1.xsd")) invoiceXsd = p;
        if (name.equals("UBL-CreditNote-2.1.xsd")) creditNoteXsd = p;
        Matcher m = TARGET.matcher(Files.readString(p));
        if (m.find()) byNamespace.merge(m.group(1), p, (a, b) -> a.toString().length() <= b.toString().length() ? a : b);
      }
    }
    DOMImplementationLS ls = (DOMImplementationLS) DOMImplementationRegistry.newInstance().getDOMImplementation("LS");
    SchemaFactory factory = SchemaFactory.newInstance(XMLConstants.W3C_XML_SCHEMA_NS_URI);
    factory.setResourceResolver((type, namespace, publicId, systemId, baseUri) -> {
      if (systemId != null) return null;
      Path found = byNamespace.get(namespace);
      if (found == null) return null;
      try {
        LSInput input = ls.createLSInput();
        input.setByteStream(new FileInputStream(found.toFile()));
        input.setSystemId(found.toUri().toString());
        return input;
      } catch (Exception e) {
        throw new RuntimeException(e);
      }
    });
    Schema invoice = factory.newSchema(invoiceXsd.toFile());
    Schema creditNote = factory.newSchema(creditNoteXsd.toFile());
    int failures = 0;
    for (int i = 1; i < args.length; i++) {
      File file = new File(args[i]);
      boolean isCreditNote = Files.readString(file.toPath()).contains("<CreditNote ");
      try {
        (isCreditNote ? creditNote : invoice).newValidator().validate(new StreamSource(file));
      } catch (org.xml.sax.SAXException e) {
        System.err.println(file.getName() + ": " + e.getMessage());
        failures++;
      }
    }
    System.out.println((args.length - 1) + " documents checked against the UBL 2.1 schema");
    if (failures > 0) System.exit(1);
  }
}
