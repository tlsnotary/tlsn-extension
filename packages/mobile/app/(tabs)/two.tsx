import { StyleSheet, ScrollView, Linking, TouchableOpacity } from 'react-native';
import { Text, View } from '@/components/Themed';

export default function AboutScreen() {
  return (
    <ScrollView style={styles.scrollView}>
      <View style={styles.container}>
        <Text style={styles.title}>About TLSNotary</Text>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>What is TLSNotary?</Text>
          <Text style={styles.text}>
            TLSNotary is a protocol that allows you to prove that data came from a specific server
            without revealing all the data to the verifier. This enables privacy-preserving proofs
            of web data.
          </Text>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>How it works</Text>
          <Text style={styles.text}>
            1. You authenticate with a service (like Spotify){'\n'}
            2. The app captures your authentication token{'\n'}
            3. TLSNotary creates a cryptographic proof of the API response{'\n'}
            4. You can share this proof without revealing sensitive data
          </Text>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>This App</Text>
          <Text style={styles.text}>
            This is a mobile proof-of-concept demonstrating TLSNotary with Spotify.
            It proves your top artist without revealing your full listening history.
          </Text>
        </View>

        <TouchableOpacity
          style={styles.link}
          onPress={() => Linking.openURL('https://tlsnotary.org')}
        >
          <Text style={styles.linkText}>Learn more at tlsnotary.org →</Text>
        </TouchableOpacity>

        <View style={styles.footer}>
          <Text style={styles.footerText}>
            Built with TLSNotary WASM + React Native
          </Text>
        </View>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  scrollView: {
    flex: 1,
  },
  container: {
    flex: 1,
    padding: 20,
  },
  title: {
    fontSize: 28,
    fontWeight: 'bold',
    color: '#1DB954',
    marginBottom: 24,
    textAlign: 'center',
  },
  section: {
    marginBottom: 24,
    backgroundColor: 'transparent',
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '600',
    marginBottom: 8,
  },
  text: {
    fontSize: 15,
    lineHeight: 22,
    color: '#666',
  },
  link: {
    backgroundColor: '#1DB954',
    padding: 16,
    borderRadius: 8,
    alignItems: 'center',
    marginTop: 16,
  },
  linkText: {
    color: 'white',
    fontSize: 16,
    fontWeight: '600',
  },
  footer: {
    marginTop: 32,
    paddingTop: 16,
    borderTopWidth: 1,
    borderTopColor: '#eee',
    backgroundColor: 'transparent',
  },
  footerText: {
    textAlign: 'center',
    color: '#999',
    fontSize: 13,
  },
});
