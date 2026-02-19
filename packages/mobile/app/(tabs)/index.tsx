import React from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
} from 'react-native';
import { useRouter } from 'expo-router';
import { PLUGIN_REGISTRY } from '../../assets/plugins/registry';

export default function PluginGalleryScreen() {
  const router = useRouter();

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      {PLUGIN_REGISTRY.map((plugin) => (
        <TouchableOpacity
          key={plugin.id}
          style={styles.card}
          activeOpacity={0.7}
          onPress={() => router.push({ pathname: '/plugin/[id]', params: { id: plugin.id } })}
        >
          <Text style={styles.logo}>{plugin.logo}</Text>
          <View style={styles.cardBody}>
            <Text style={styles.name}>{plugin.name}</Text>
            <Text style={styles.description}>{plugin.description}</Text>
          </View>
        </TouchableOpacity>
      ))}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f0f2f5',
  },
  content: {
    padding: 16,
    gap: 12,
  },
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 8,
    elevation: 3,
  },
  logo: {
    fontSize: 40,
    width: 60,
    textAlign: 'center',
  },
  cardBody: {
    flex: 1,
    marginLeft: 12,
  },
  name: {
    fontSize: 18,
    fontWeight: '700',
    color: '#243f5f',
    marginBottom: 4,
  },
  description: {
    fontSize: 14,
    color: '#666',
    lineHeight: 20,
  },
});
